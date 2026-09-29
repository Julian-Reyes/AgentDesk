import { describe, expect, it } from "vitest";
import type { ModelConfig } from "../../src/llm/config.ts";
import { createOpenAICompatibleProvider, retryDelayMs } from "../../src/llm/openai-compatible.ts";
import { RateLimiter, estimateTokens } from "../../src/llm/throttle.ts";
import type { ChatRequest } from "../../src/llm/types.ts";

/** A fake clock: sleeping just moves time forward, so tests run instantly. Shared by the limiter and the client's backoff. */
function clock() {
  let t = 0;
  const waits: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      waits.push(ms);
      t += ms;
    },
    advance: (ms: number) => void (t += ms),
    waits,
    get t() {
      return t;
    },
  };
}

const config: ModelConfig = { id: "gemini/test", provider: "gemini", model: "m", baseUrl: "https://x.test/v1", params: {}, pricing: { inputPerMTok: 0, outputPerMTok: 0 } };
const req: ChatRequest = { messages: [{ role: "user", content: "hi" }] };

const okResponse = (inputTokens: number, outputTokens = 0) =>
  new Response(JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens } }), { status: 200 });

/** The real HTTP client, with a scripted fetch and the shared fake clock. */
function client(limiter: RateLimiter, c: ReturnType<typeof clock>, responses: Response[]) {
  let calls = 0;
  const fetch = (async () => {
    calls++;
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    return next;
  }) as unknown as typeof globalThis.fetch;
  const p = createOpenAICompatibleProvider(config, { fetch, sleep: c.sleep, now: c.now, env: {}, limiter });
  return { p, calls: () => calls };
}

describe("rate limiter (through the HTTP client)", () => {
  it("rpm: the 6th call in a minute waits until the first leaves the window", async () => {
    const c = clock();
    const { p } = client(new RateLimiter({ rpm: 5 }, c), c, Array.from({ length: 6 }, () => okResponse(10)));
    for (let i = 0; i < 5; i++) {
      await p.chat(req);
      c.advance(1000);
    }
    expect(c.waits).toEqual([]);
    await p.chat(req); // t = 5000; the first call was at 0
    expect(c.waits).toEqual([55_000]);
  });

  it("retries take slots too: failed attempts count against the provider's quota", async () => {
    // Regression: retries used to bypass the limiter, and three 503 retries used up Gemini's 5/min.
    const c = clock();
    const busy = () => new Response('{"error":{"code":503,"message":"high demand"}}', { status: 503 });
    const { p, calls } = client(new RateLimiter({ rpm: 2 }, c), c, [busy(), busy(), okResponse(10)]);
    await p.chat(req);
    expect(calls()).toBe(3);
    // Attempt 1 at t=0, backoff 2s, attempt 2 at t=2s, backoff 4s → t=6s: the 2/min limit forces a wait until t=60s.
    expect(c.waits).toEqual([2000, 4000, 54_000]);
  });

  it("uses Gemini's retry delay from the error body (it sends no Retry-After header)", async () => {
    const c = clock();
    const quota = new Response(
      JSON.stringify([{ error: { code: 429, message: "Quota exceeded ... Please retry in 2.29s.", details: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2s" }] } }]),
      { status: 429 },
    );
    const { p } = client(new RateLimiter({ rpm: 5 }, c), c, [quota, okResponse(10)]);
    await p.chat(req);
    // The body has two hints ("retry in 2.29s" and retryDelay "2s"); the more precise one comes first and wins, plus a 1s margin.
    expect(c.waits).toEqual([3290]);
    expect(retryDelayMs(null, 1, '{"retryDelay": "2s"}')).toBe(3000);
  });

  it("tpm: waits for enough tokens to expire, using real usage from responses", async () => {
    const c = clock();
    // Groq-like: 8K tokens/min. Two calls use 3K each (as reported by the provider).
    const { p } = client(new RateLimiter({ rpm: 30, tpm: 8000 }, c), c, [okResponse(2900, 100), okResponse(2900, 100), okResponse(10)]);
    await p.chat(req);
    c.advance(10_000);
    await p.chat(req);
    c.advance(10_000);
    // A ~2.5K-token request doesn't fit next to 6K: wait until the first call (t=0) expires.
    const big: ChatRequest = { messages: [{ role: "user", content: "x".repeat(10_000) }] };
    expect(estimateTokens(big)).toBeGreaterThan(2000);
    await p.chat(big);
    expect(c.waits).toEqual([40_000]);
  });

  it("a request larger than the whole budget waits for an empty window, then goes alone", async () => {
    const c = clock();
    const { p } = client(new RateLimiter({ tpm: 8000 }, c), c, [okResponse(100), okResponse(9000)]);
    await p.chat(req);
    await p.chat({ messages: [{ role: "user", content: "x".repeat(40_000) }] });
    expect(c.waits).toEqual([60_000]);
  });

  it("two providers sharing one limiter (router + agent on the same model) don't both take the last slot", async () => {
    const c = clock();
    const limiter = new RateLimiter({ rpm: 1 }, c);
    const a = client(limiter, c, [okResponse(1)]).p;
    const b = client(limiter, c, [okResponse(1)]).p;
    await Promise.all([a.chat(req), b.chat(req)]);
    expect(c.waits).toEqual([60_000]);
  });

  it("reports waits so the CLI can show them", async () => {
    const c = clock();
    const seen: Array<[number, string]> = [];
    const { p } = client(new RateLimiter({ rpm: 1 }, { ...c, onWait: (ms, r) => seen.push([ms, r]) }), c, [okResponse(1), okResponse(1)]);
    await p.chat(req);
    await p.chat(req);
    expect(seen).toEqual([[60_000, "rpm"]]);
  });
});
