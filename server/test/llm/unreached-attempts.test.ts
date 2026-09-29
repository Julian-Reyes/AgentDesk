import { describe, expect, it } from "vitest";
import type { ModelConfig } from "../../src/llm/config.ts";
import { ProviderError, createOpenAICompatibleProvider, describeNetworkError } from "../../src/llm/openai-compatible.ts";
import { RateLimiter } from "../../src/llm/throttle.ts";
import type { ChatRequest } from "../../src/llm/types.ts";

/**
 * Attempts that never reached the provider (the connection itself failed) used
 * none of its quota, so they give their rate-limit slot back. Found in
 * Julian's run 5f75a382: a connect timeout to api.groq.com was charged ~2K
 * tokens against Groq's 8K/min, lengthening later waits.
 */

function clock() {
  let t = 0;
  const waits: number[] = [];
  return { now: () => t, sleep: async (ms: number) => void (waits.push(ms), (t += ms)), waits };
}

const groq: ModelConfig = { id: "groq/gpt-oss-120b", provider: "groq", model: "openai/gpt-oss-120b", baseUrl: "https://api.groq.com/openai/v1", params: {}, pricing: { inputPerMTok: 0, outputPerMTok: 0 } };
const req: ChatRequest = { messages: [{ role: "user", content: "hi" }] };
const ok = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 1 } }), { status: 200 });
const netError = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

function client(limiter: RateLimiter, c: ReturnType<typeof clock>, script: Array<Response | Error>) {
  const fetch = (async () => {
    const next = script.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof globalThis.fetch;
  return createOpenAICompatibleProvider(groq, { fetch, sleep: c.sleep, now: c.now, env: {}, limiter });
}

describe("attempts that never reached the provider", () => {
  it("a connect timeout gives its slot back, so the retry doesn't wait for it", async () => {
    const c = clock();
    // 1 request/min: if the failed attempt kept its slot, the retry would wait ~60s.
    const p = client(new RateLimiter({ rpm: 1 }, c), c, [netError("UND_ERR_CONNECT_TIMEOUT"), ok()]);
    await p.chat(req);
    expect(c.waits).toEqual([2000]); // only the backoff
  });

  it("a response timeout keeps its slot: the request may have been received and counted", async () => {
    const c = clock();
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    const p = client(new RateLimiter({ rpm: 1 }, c), c, [timeout, ok()]);
    await p.chat(req);
    expect(c.waits).toEqual([2000, 58_000]); // backoff, then the throttle waits out the first attempt's minute
  });

  it("classifies which failures reached the provider", () => {
    const at = "https://api.groq.com/openai/v1/chat/completions";
    expect(describeNetworkError(netError("UND_ERR_CONNECT_TIMEOUT"), groq, at, 90_000)).toEqual({
      message: "couldn't connect to groq at api.groq.com (connect timeout).",
      retryable: true,
      reachedProvider: false,
    });
    expect(describeNetworkError(netError("ECONNREFUSED"), groq, at, 90_000).reachedProvider).toBe(false);
    expect(describeNetworkError(netError("ENOTFOUND"), groq, at, 90_000).reachedProvider).toBe(false);
    expect(describeNetworkError(netError("ECONNRESET"), groq, at, 90_000).reachedProvider).toBe(true);
  });

  it("release() frees a reservation; releasing twice is harmless", async () => {
    const c = clock();
    const limiter = new RateLimiter({ rpm: 1 }, c);
    const slot = await limiter.acquire(10);
    limiter.release(slot);
    limiter.release(slot);
    await limiter.acquire(10);
    expect(c.waits).toEqual([]);
  });

  it("when every attempt fails, the error still carries all the failed attempts (for the trace)", async () => {
    const c = clock();
    const garbled = () =>
      new Response(JSON.stringify({ error: { message: "attempted to call tool 'hand-off' which was not in request.tools", code: "tool_use_failed" } }), { status: 400 });
    const p = client(new RateLimiter({ rpm: 100 }, c), c, [garbled(), garbled(), garbled(), garbled()]);
    const err = await p.chat(req).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.failedAttempts).toHaveLength(4);
    expect(err.failedAttempts.every((a: { code?: string }) => a.code === "tool_use_failed")).toBe(true);
  });

  it("onWait says which model and which limit", async () => {
    const c = clock();
    const seen: string[] = [];
    const limiter = new RateLimiter({ tpm: 8000, label: "groq/openai/gpt-oss-120b" }, { ...c, onWait: (ms, reason, info) => seen.push(`${ms} ${reason} ${info.label} ${info.limit}`) });
    await limiter.acquire(5000);
    await limiter.acquire(5000);
    expect(seen).toEqual(["60000 tpm groq/openai/gpt-oss-120b 8000"]);
  });
});
