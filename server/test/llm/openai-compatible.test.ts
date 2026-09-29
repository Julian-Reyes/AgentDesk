import { describe, expect, it } from "vitest";
import type { ModelConfig } from "../../src/llm/config.ts";
import {
  ProviderError,
  createOpenAICompatibleProvider,
  retryDelayMs,
  toWireRequest,
} from "../../src/llm/openai-compatible.ts";

const groq: ModelConfig = {
  id: "groq/test",
  provider: "groq",
  model: "openai/gpt-oss-120b",
  baseUrl: "https://api.example.test/openai/v1/",
  apiKeyEnv: "TEST_KEY",
  params: { temperature: 0.2, reasoningEffort: "low" },
  pricing: { inputPerMTok: 0, outputPerMTok: 0 },
};

const okBody = {
  choices: [
    {
      message: {
        role: "assistant",
        content: "",
        reasoning: "The customer wants order 1042.",
        tool_calls: [{ id: "c1", type: "function", function: { name: "get_order", arguments: '{"orderId":1042}' } }],
      },
      finish_reason: "tool_calls",
    },
  ],
  usage: { prompt_tokens: 812, completion_tokens: 24 },
};

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function provider(responses: Array<Response | Error>, sleeps: number[] = []) {
  const f = fakeFetch(responses);
  const p = createOpenAICompatibleProvider(groq, {
    fetch: f.fn,
    sleep: async (ms) => void sleeps.push(ms),
    env: { TEST_KEY: "sk-test" },
  });
  return { p, calls: f.calls };
}

describe("OpenAI-compatible client", () => {
  it("sends the wire format: model, messages, tools, params, auth header", async () => {
    const { p, calls } = provider([json(okBody)]);
    await p.chat({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "where is 1042?" },
        { role: "assistant", content: null, toolCalls: [{ id: "c0", name: "find_customer", arguments: "{}" }] },
        { role: "tool", toolCallId: "c0", content: '{"ok":true}' },
      ],
      tools: [{ name: "get_order", description: "d", parameters: { type: "object" } }],
    });
    expect(calls[0]!.url).toBe("https://api.example.test/openai/v1/chat/completions");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.temperature).toBe(0.2);
    expect(body.reasoning_effort).toBe("low");
    expect(body.tools[0]).toEqual({ type: "function", function: { name: "get_order", description: "d", parameters: { type: "object" } } });
    expect(body.messages[2].tool_calls[0]).toEqual({ id: "c0", type: "function", function: { name: "find_customer", arguments: "{}" } });
    expect(body.messages[3]).toEqual({ role: "tool", tool_call_id: "c0", content: '{"ok":true}' });
  });

  it("parses tool calls, reasoning and usage; empty content becomes null", async () => {
    const { p } = provider([json(okBody)]);
    const r = await p.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.message).toEqual({ role: "assistant", content: null, toolCalls: [{ id: "c1", name: "get_order", arguments: '{"orderId":1042}' }] });
    expect(r.reasoning).toBe("The customer wants order 1042.");
    expect(r.usage).toEqual({ inputTokens: 812, outputTokens: 24 });
    expect(r.finishReason).toBe("tool_calls");
  });

  it("normalizes object arguments to JSON text and fills in missing ids", async () => {
    const body = { choices: [{ message: { content: null, tool_calls: [{ function: { name: "get_order", arguments: { orderId: 1 } } }] }, finish_reason: "stop" }] };
    const { p } = provider([json(body)]);
    const r = await p.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(r.message.toolCalls).toEqual([{ id: "call_0", name: "get_order", arguments: '{"orderId":1}' }]);
  });

  it("omits tools and unset params instead of sending empty values", () => {
    const wire = toWireRequest({ ...groq, params: {} }, { messages: [{ role: "user", content: "x" }], tools: [] });
    expect(wire).toEqual({ model: groq.model, messages: [{ role: "user", content: "x" }] });
  });

  it("retries 429 using Retry-After, then succeeds", async () => {
    const sleeps: number[] = [];
    const { p, calls } = provider([json({ error: "slow down" }, 429, { "retry-after": "7" }), json(okBody)], sleeps);
    await p.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([7000]);
  });

  it("retries 5xx and network errors with backoff, then gives up", async () => {
    const sleeps: number[] = [];
    const { p, calls } = provider([json({}, 503), new TypeError("fetch failed"), json({}, 500), json({}, 502)], sleeps);
    await expect(p.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ status: 502, retryable: true });
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([2000, 4000, 8000]);
  });

  it("does not retry 4xx errors (those are our bugs)", async () => {
    const { p, calls } = provider([json({ error: "bad tool schema" }, 400)]);
    const err = await p.chat({ messages: [{ role: "user", content: "hi" }] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(400);
    expect(calls).toHaveLength(1);
  });

  it("refuses to start without its API key", () => {
    expect(() => createOpenAICompatibleProvider(groq, { env: {} })).toThrow(/TEST_KEY/);
  });

  it("backoff is capped", () => {
    expect(retryDelayMs(null, 10)).toBe(60_000);
    expect(retryDelayMs("999", 1)).toBe(120_000);
    expect(retryDelayMs("soon", 2)).toBe(4000);
  });
});
