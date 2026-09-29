import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CacheMissError, cacheKey, stableStringify, withCache } from "../../src/llm/cache.ts";
import type { ModelConfig } from "../../src/llm/config.ts";
import { FakeProvider, fake } from "../../src/llm/fake.ts";
import type { ChatRequest } from "../../src/llm/types.ts";

const groq: ModelConfig = {
  id: "groq/gpt-oss-120b",
  provider: "groq",
  model: "openai/gpt-oss-120b",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKeyEnv: "GROQ_API_KEY",
  params: {},
  pricing: { inputPerMTok: 0, outputPerMTok: 0 },
};
const req: ChatRequest = { messages: [{ role: "user", content: "Where is #1042?" }] };
const tmp = () => mkdtempSync(join(tmpdir(), "llm-cache-"));

describe("cache key", () => {
  it("ignores object key order but not content", () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(stableStringify({ a: [1, { c: 3, d: 2 }], b: 1 }));
    expect(cacheKey(groq, req)).not.toBe(cacheKey(groq, { messages: [{ role: "user", content: "Where is #1043?" }] }));
  });

  it("the same model on a different provider is a different entry", () => {
    const cerebras: ModelConfig = { ...groq, id: "cerebras/gpt-oss-120b", provider: "cerebras" };
    expect(cacheKey(cerebras, req)).not.toBe(cacheKey(groq, req));
    // Even if someone reused the id, the provider alone still separates them.
    expect(cacheKey({ ...groq, provider: "cerebras" }, req)).not.toBe(cacheKey(groq, req));
  });

  it("changes with params, tools and response format", () => {
    const base = cacheKey(groq, req);
    expect(cacheKey({ ...groq, params: { temperature: 0.5 } }, req)).not.toBe(base);
    expect(cacheKey(groq, { ...req, tools: [{ name: "get_order", description: "d", parameters: {} }] })).not.toBe(base);
    expect(cacheKey(groq, { ...req, responseFormat: "json" })).not.toBe(base);
  });

  it("does not depend on baseUrl or the API key env var (moving Ollama to the Mac mini keeps the cache)", () => {
    expect(cacheKey({ ...groq, baseUrl: "http://10.0.0.7:11434/v1", apiKeyEnv: "OTHER" }, req)).toBe(cacheKey(groq, req));
  });
});

describe("withCache", () => {
  it("record: calls the provider once, then replays the stored response with its original latency", async () => {
    const dir = tmp();
    const inner = new FakeProvider([{ ...fake.reply("It shipped."), latencyMs: 1234 }]);
    const p = withCache(inner, groq, { mode: "record", dir, now: () => new Date("2026-09-29T00:00:00Z") });

    const first = await p.chat(req);
    const second = await p.chat(req);
    expect(inner.requests).toHaveLength(1);
    expect(first.cached).toBeUndefined();
    expect(second).toEqual({ ...first, cached: true });
    expect(second.latencyMs).toBe(1234);

    // Entries are stored per provider and never contain a key or base URL.
    const [shard] = readdirSync(join(dir, "groq"));
    const [file] = readdirSync(join(dir, "groq", shard!));
    const text = readFileSync(join(dir, "groq", shard!, file!), "utf8");
    expect(JSON.parse(text)).toMatchObject({ configId: "groq/gpt-oss-120b", provider: "groq", recordedAt: "2026-09-29T00:00:00.000Z" });
    expect(text).not.toMatch(/api\.groq\.com|GROQ_API_KEY/);
  });

  it("replay: a hit costs nothing; a miss throws instead of calling the provider", async () => {
    const dir = tmp();
    await withCache(new FakeProvider([fake.reply("It shipped.")]), groq, { mode: "record", dir }).chat(req);

    const inner = new FakeProvider([fake.reply("should never be used")]);
    const replay = withCache(inner, groq, { mode: "replay", dir });
    expect((await replay.chat(req)).cached).toBe(true);
    await expect(replay.chat({ messages: [{ role: "user", content: "new question" }] })).rejects.toBeInstanceOf(CacheMissError);
    expect(inner.requests).toHaveLength(0);
  });

  it("off: always calls the provider", async () => {
    const inner = new FakeProvider([fake.reply("a"), fake.reply("b")]);
    const p = withCache(inner, groq, { mode: "off", dir: tmp() });
    await p.chat(req);
    await p.chat(req);
    expect(inner.requests).toHaveLength(2);
  });

  it("provider errors are not cached", async () => {
    const dir = tmp();
    const inner = new FakeProvider([new Error("503"), fake.reply("ok")]);
    const p = withCache(inner, groq, { mode: "record", dir });
    await expect(p.chat(req)).rejects.toThrow("503");
    expect((await p.chat(req)).message.toolCalls?.[0]?.name).toBe("reply");
    expect(inner.requests).toHaveLength(2);
  });
});
