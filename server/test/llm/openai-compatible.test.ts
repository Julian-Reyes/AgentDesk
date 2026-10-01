import { describe, expect, it } from "vitest";
import type { ModelConfig } from "../../src/llm/config.ts";
import {
  ProviderError,
  createOpenAICompatibleProvider,
  describeNetworkError,
  isDailyQuota,
  repairReplyCall,
  retryDelayMs,
  toWireRequest,
  withCorrection,
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

  it("a daily-quota 429 fails fast with a clear message instead of retrying", async () => {
    const body = { error: { message: "Quota exceeded for metric: generate_content_free_tier_requests", details: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] } };
    const { p, calls } = provider([json(body, 429)]);
    const err = await p.chat({ messages: [{ role: "user", content: "hi" }] }).catch((e) => e);
    expect(err).toMatchObject({ status: 429, retryable: false, message: expect.stringMatching(/daily free-tier quota/) });
    expect(calls).toHaveLength(1);
  });

  it("recognizes daily limits from Gemini and Groq, but not per-minute ones", () => {
    expect(isDailyQuota("GenerateRequestsPerDayPerProjectPerModel-FreeTier")).toBe(true);
    expect(isDailyQuota("Rate limit reached for model openai/gpt-oss-120b on tokens per day (TPD): Limit 200000")).toBe(true);
    expect(isDailyQuota("Rate limit reached on requests per day (RPD)")).toBe(true);
    expect(isDailyQuota("Rate limit reached for model openai/gpt-oss-120b on tokens per minute (TPM): Limit 8000")).toBe(false);
    expect(isDailyQuota("GenerateRequestsPerMinutePerProjectPerModel-FreeTier")).toBe(false);
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

describe("model-output failures (Groq returns 400 when the model's own output can't be parsed)", () => {
  const groq400 = (code: string) =>
    json({ error: { message: "Failed to parse tool call arguments as JSON", type: "invalid_request_error", code, failed_generation: '{"name": "reply", "arguments": Our top pick…' } }, 400);

  it("retries tool_use_failed / output_parse_failed / json_validate_failed, and reports the failed attempts", async () => {
    for (const code of ["tool_use_failed", "output_parse_failed", "json_validate_failed"]) {
      const sleeps: number[] = [];
      const { p, calls } = provider([groq400(code), json(okBody)], sleeps);
      const r = await p.chat({ messages: [{ role: "user", content: "hi" }] });
      expect(calls).toHaveLength(2);
      expect(sleeps).toEqual([500]);
      expect(r.failedAttempts).toEqual([{ status: 400, code, message: expect.stringContaining(code), failedGeneration: '{"name": "reply", "arguments": Our top pick…' }]);
    }
  });

  it("gives up after max attempts with the provider's message", async () => {
    const { p, calls } = provider([groq400("tool_use_failed"), groq400("tool_use_failed"), groq400("tool_use_failed"), groq400("tool_use_failed")]);
    await expect(p.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(4);
  });

  it("other 400s are still our bug and fail fast", async () => {
    const { p, calls } = provider([json({ error: { message: "tools[0].function.parameters is invalid", code: "invalid_request" } }, 400)]);
    await expect(p.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ status: 400, retryable: false });
    expect(calls).toHaveLength(1);
  });

  it("a clean first attempt has no failedAttempts field", async () => {
    const { p } = provider([json(okBody)]);
    expect((await p.chat({ messages: [{ role: "user", content: "hi" }] })).failedAttempts).toBeUndefined();
  });
});

describe("round 2: repairing plain-text reply calls, and corrective retries", () => {
  const REPLY = { name: "reply", description: "Send your message to the customer.", parameters: { type: "object" } };
  const GET_ORDER = { name: "get_order", description: "d", parameters: { type: "object" } };
  const agentReq = { messages: [{ role: "user" as const, content: "Can I return the boots?" }], tools: [GET_ORDER, REPLY] };
  const rejected = (code: string, generation: string) =>
    json({ error: { message: "Failed to parse tool call arguments as JSON", type: "invalid_request_error", code, failed_generation: generation } }, 400);
  const TEXT = "I’m sorry, but the Ridgeline Mid Hiking Boot can’t be returned because it’s been used.";

  it("rebuilds gpt-oss's plain-text reply call (dev-1/1b/2: 107 of 122 rejections)", () => {
    expect(repairReplyCall(agentReq, "tool_use_failed", `{"name": "reply", "arguments": ${TEXT}}`)).toEqual({ id: "repaired_0", name: "reply", arguments: JSON.stringify({ message: TEXT }) });
    // Multi-line text, no closing brace, and a brace inside the text are all kept as written.
    expect(JSON.parse(repairReplyCall(agentReq, "tool_use_failed", '{"name":"reply","arguments": Two options:\n- {A}\n- B')!.arguments)).toEqual({ message: "Two options:\n- {A}\n- B" });
    // Valid JSON the provider choked on anyway: a JSON string or a {"message"} object.
    expect(JSON.parse(repairReplyCall(agentReq, "tool_use_failed", `{"name": "reply", "arguments": ${JSON.stringify(TEXT)}}`)!.arguments)).toEqual({ message: TEXT });
    expect(JSON.parse(repairReplyCall(agentReq, "tool_use_failed", `{"name": "reply", "arguments": {"message": "Hi"}}`)!.arguments)).toEqual({ message: "Hi" });
  });

  it("repairs nothing else: other tools, invented names, other codes, broken JSON, or no reply tool offered", () => {
    expect(repairReplyCall(agentReq, "tool_use_failed", `{"name": "response", "arguments": ${TEXT}}`)).toBeNull();
    expect(repairReplyCall(agentReq, "tool_use_failed", `{"name": "get_order", "arguments": 1042}`)).toBeNull();
    expect(repairReplyCall(agentReq, "output_parse_failed", `{"name": "reply", "arguments": ${TEXT}}`)).toBeNull();
    expect(repairReplyCall(agentReq, "tool_use_failed", `{"name": "reply", "arguments": {"message": "Hi`)).toBeNull();
    expect(repairReplyCall(agentReq, "tool_use_failed", `{"name": "reply", "arguments": }`)).toBeNull();
    expect(repairReplyCall(agentReq, "tool_use_failed", "We need to answer the customer.")).toBeNull();
    expect(repairReplyCall({ messages: agentReq.messages, tools: [GET_ORDER] }, "tool_use_failed", `{"name": "reply", "arguments": ${TEXT}}`)).toBeNull();
  });

  it("the client returns the repaired call at once, marked and with the rejected attempt kept", async () => {
    const generation = `{"name": "reply", "arguments": ${TEXT}}`;
    const { p, calls } = provider([rejected("tool_use_failed", generation)]);
    const r = await p.chat(agentReq);
    expect(calls).toHaveLength(1);
    expect(r).toMatchObject({ repaired: true, finishReason: "repaired", usage: { inputTokens: 0, outputTokens: 0 } });
    expect(r.message).toEqual({ role: "assistant", content: null, toolCalls: [{ id: "repaired_0", name: "reply", arguments: JSON.stringify({ message: TEXT }) }] });
    expect(r.failedAttempts).toEqual([{ status: 400, code: "tool_use_failed", message: expect.any(String), failedGeneration: generation }]);
  });

  it("anything it can't repair is retried with a short note on what was wrong (the original request is unchanged)", async () => {
    const { p, calls } = provider([rejected("tool_use_failed", `{"name": "commentary", "arguments": ${TEXT}}`), json(okBody)]);
    const r = await p.chat(agentReq);
    expect(r.repaired).toBeUndefined();
    const sent = calls.map((c) => JSON.parse(c.init.body as string).messages);
    expect(sent[0]).toHaveLength(1);
    expect(sent[1].at(-1)).toEqual({ role: "user", content: '(Your last response called "commentary", which is not one of your tools. Use only the listed tools. To answer the customer, call reply with {"message": "…"}.)' });
    expect(agentReq.messages).toHaveLength(1);
  });

  it("the note fits the failure", () => {
    const note = (r: Parameters<typeof withCorrection>[0], code: string, g: string | null) => (withCorrection(r, code, g).messages.at(-1) as { content: string }).content;
    expect(note(agentReq, "tool_use_failed", '{"name": "get_order", "arguments": order 1042}')).toBe(
      '(Your last tool call\'s arguments were not valid JSON. Send the call again with a JSON object as its arguments. To answer the customer, call reply with {"message": "…"}.)',
    );
    expect(note(agentReq, "output_parse_failed", "We need to answer: is the tent waterproof?")).toMatch(/^\(Your last response could not be read\. .*don't write your reasoning/);
    expect(note({ messages: [], responseFormat: "json" }, "json_validate_failed", null)).toBe("(Your last answer was not valid JSON. Answer with one JSON object only.)");
  });
});

describe("provider-specific tool-call fields (Gemini thought signatures)", () => {
  it("keeps extra fields from a response and sends them back unchanged on the next request", async () => {
    const signed = {
      choices: [{
        message: {
          content: null,
          tool_calls: [{ extra_content: { google: { thought_signature: "EmAKXg…" } }, function: { arguments: '{"orderId":1042}', name: "get_order" }, id: "call_295001", type: "function" }],
        },
        finish_reason: "tool_calls",
      }],
    };
    const { p, calls } = provider([json(signed), json(okBody)]);
    const first = await p.chat({ messages: [{ role: "user", content: "Where is 1042?" }] });
    const call = first.message.toolCalls![0]!;
    expect(call).toEqual({ id: "call_295001", name: "get_order", arguments: '{"orderId":1042}', providerData: { extra_content: { google: { thought_signature: "EmAKXg…" } } } });

    await p.chat({ messages: [{ role: "user", content: "Where is 1042?" }, first.message, { role: "tool", toolCallId: call.id, content: "{}" }] });
    const sent = JSON.parse(calls[1]!.init.body as string).messages[1].tool_calls[0];
    expect(sent).toEqual({ extra_content: { google: { thought_signature: "EmAKXg…" } }, id: "call_295001", type: "function", function: { name: "get_order", arguments: '{"orderId":1042}' } });
  });

  it("standard fields can't be overwritten by providerData", () => {
    const wire = toWireRequest(groq, {
      messages: [{ role: "assistant", content: null, toolCalls: [{ id: "a", name: "reply", arguments: "{}", providerData: { id: "evil", function: { name: "issue_refund" } } }] }],
    });
    expect((wire.messages[0] as any).tool_calls[0]).toMatchObject({ id: "a", function: { name: "reply" } });
  });
});

describe("network errors (Node's fetch only says 'fetch failed'; the reason is in error.cause)", () => {
  const ollama: ModelConfig = { id: "ollama/qwen3.5-4b", provider: "ollama", model: "qwen3.5:4b", baseUrl: "http://localhost:11434/v1", params: {}, pricing: { inputPerMTok: 0, outputPerMTok: 0 } };
  const netError = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

  function ollamaProvider(errors: Error[], sleeps: number[] = []) {
    let calls = 0;
    const fetch = (async () => {
      calls++;
      const e = errors.shift();
      if (e) throw e;
      return json(okBody);
    }) as unknown as typeof globalThis.fetch;
    const p = createOpenAICompatibleProvider(ollama, { fetch, sleep: async (ms) => void sleeps.push(ms), env: {} });
    return { p, calls: () => calls };
  }

  it("connection refused fails fast with where it tried to connect and what to check", async () => {
    const sleeps: number[] = [];
    const { p, calls } = ollamaProvider([netError("ECONNREFUSED")], sleeps);
    const err = await p.chat({ messages: [{ role: "user", content: "hi" }] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toBe("ollama/qwen3.5-4b: can't connect to ollama at localhost:11434 (connection refused). Is Ollama running? Check OLLAMA_BASE_URL in .env.");
    expect(err.retryable).toBe(false);
    expect(calls()).toBe(1); // no ~14s of pointless backoff
    expect(sleeps).toEqual([]);
  });

  it("an unknown host fails fast too", async () => {
    const { p, calls } = ollamaProvider([netError("ENOTFOUND")]);
    await expect(p.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(/can't find host localhost:11434/);
    expect(calls()).toBe(1);
  });

  it("timeouts and dropped connections are still retried", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const { p, calls } = ollamaProvider([timeout, netError("ECONNRESET")]);
    await p.chat({ messages: [{ role: "user", content: "hi" }] });
    expect(calls()).toBe(3);
  });

  it("describes a timeout and an unexpected error clearly", () => {
    // Both happen after a connection was made, so the provider may have received (and counted)
    // the request: they keep their rate-limit slot (reachedProvider: true) and are retried.
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    expect(describeNetworkError(timeout, ollama, "http://mini.local:11434/v1/chat/completions", 600_000)).toEqual({
      message: "no response from ollama at mini.local:11434 within 600s.",
      retryable: true,
      reachedProvider: true,
    });
    expect(describeNetworkError(netError("ECONNRESET"), ollama, "http://mini.local:11434/v1/chat/completions", 1000)).toEqual({
      message: "network error talking to ollama at mini.local:11434: fetch failed (ECONNRESET)",
      retryable: true,
      reachedProvider: true,
    });
  });
});
