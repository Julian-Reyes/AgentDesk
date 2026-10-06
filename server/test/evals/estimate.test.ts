import { describe, expect, it } from "vitest";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { caseCost, estimateAgents, estimateJudge, renderEstimate } from "../../src/evals/runner/estimate.ts";
import { getModelConfig } from "../../src/llm/config.ts";

const byId = (id: string) => ALL_CASES.find((c) => c.id === id)!;
const dev = ALL_CASES.filter((c) => c.split === "dev");
const env = { GEMINI_API_KEY: "x", GROQ_API_KEY: "x" };
const cfg = (id: string) => getModelConfig(id, undefined, env);

describe("per-conversation cost from the case's shape", () => {
  it("a Router-only case is one call per message", () => {
    expect(caseCost(byId("out-of-scope-01"), "groq/gpt-oss-120b")).toMatchObject({ calls: 1, inputTokens: 420 });
  });

  it("an agent case: router + ~3.5 agent calls per message, later messages carry more context", () => {
    const one = caseCost(byId("order-status-01"), "groq/gpt-oss-120b");
    expect(one).toMatchObject({ calls: 4.5, inputTokens: 420 + 3.5 * 1600, latencyMs: 4.5 * 600 });
    const two = caseCost(byId("returns-01"), "groq/gpt-oss-120b");
    expect(two.inputTokens).toBe(420 + 3.5 * 1600 + 3.5 * 1600 * 1.6);
  });

  it("uses each model's measured tokenizer and speed", () => {
    expect(caseCost(byId("order-status-01"), "groq/qwen3.8-27b").inputTokens).toBe(Math.round((420 + 5600) * 1.5));
    // Flash-Lite from test-1's 485 calls: 1.9 s per call, 45 output tokens per call, input ×1.4 of gpt-oss's.
    expect(caseCost(byId("order-status-01"), "gemini/gemini-3.5-flash-lite")).toMatchObject({ latencyMs: 4.5 * 1900, outputTokens: Math.round(4.5 * 45), inputTokens: Math.round((420 + 5600) * 1.4) });
  });
});

describe("time and the bottleneck, per model", () => {
  // Groq's free-tier limits (docs/FREE_TIERS.md), fixed here so the test doesn't depend on the live config.
  const groqFree = (id: string) => ({ ...cfg(id), rpm: 30, tpm: 8000, rpd: 1000, tpd: 200000 });

  it("Groq free tier: the daily token limit decides, and the dev set needs more than one day", () => {
    const e = estimateAgents(groqFree("groq/qwen3.8-27b"), dev, []);
    expect(e.conversations).toBe(dev.length);
    expect(e.days.tokens!).toBeGreaterThan(1);
    expect(e.daysNeeded).toBe(Math.ceil(e.days.tokens!));
    expect(e.bottleneck).toBe("tokens/day (200,000)");
  });

  it("Groq paid tier (the live config): no daily cap to wait for, and the run records a real cost", () => {
    const e = estimateAgents(cfg("groq/qwen3.8-27b"), dev, []);
    expect(e.days.tokens).toBeNull();
    expect(e.activeMinutes).toBeLessThan(10);
    expect(e.costUsd).toBeCloseTo((e.inputTokens * 0.8 + e.outputTokens * 4) / 1e6);
    expect(e.costUsd).toBeGreaterThan(0.3);
  });

  it("Gemini Flash-Lite, paid tier (the live config, 2026-10-06): no daily limit, a real cost at $0.30 / $2.50 per 1M", () => {
    const e = estimateAgents(cfg("gemini/gemini-3.5-flash-lite"), dev, []);
    expect(e).toMatchObject({ noDailyLimit: true, daysNeeded: 1 });
    expect(e.costUsd).toBeCloseTo((e.inputTokens * 0.3 + e.outputTokens * 2.5) / 1e6);
    expect(e.costUsd).toBeGreaterThan(0);
  });

  it("Gemini Flash-Lite, free tier (until 2026-10-06): daily limit unknown, and free", () => {
    const e = estimateAgents({ ...cfg("gemini/gemini-3.5-flash-lite"), tier: "free", pricing: { inputPerMTok: 0, outputPerMTok: 0 } }, dev, []);
    expect(e).toMatchObject({ noDailyLimit: false, daysNeeded: null, costUsd: 0 });
  });

  it("switches to the run's own averages once 5 conversations are finished", () => {
    const finished = Array.from({ length: 5 }, () => ({ calls: 4, inputTokens: 5000, outputTokens: 200, latencyMs: 2000 }));
    const e = estimateAgents(cfg("groq/gpt-oss-120b"), dev.slice(0, 10), finished);
    expect(e).toMatchObject({ calls: 40, inputTokens: 50000, outputTokens: 2000, source: "this run's 5 finished conversations" });
    expect(estimateAgents(cfg("groq/gpt-oss-120b"), dev.slice(0, 10), finished.slice(0, 4)).source).toMatch(/M2 measurements/);
  });

  it("nothing left to run means nothing to wait for", () => {
    expect(estimateAgents(cfg("groq/gpt-oss-120b"), [], [])).toMatchObject({ calls: 0, activeMinutes: 0, daysNeeded: 1 });
  });

  it("the judge (rubric@2): ~8 parallel calls per conversation, at about one call's latency (Gemma's measured speed)", () => {
    const e = estimateJudge(cfg("gemini/gemma-4-31b"), 120);
    expect(e).toMatchObject({ role: "judge", calls: 960, inputTokens: 1_116_000 });
    expect(e.minutes.tokens).toBeCloseTo((1_116_000 + 228_000) / 16_000); // in + out at 16K tokens/min: 84 min
    expect(e.minutes.latency).toBeCloseTo((120 * 62.6) / 60);
    expect(e.bottleneck).toBe("model speed (latency)");
  });

  it("renders one row per model, the parallel total, and the unknown daily limits", () => {
    const text = renderEstimate([estimateAgents(cfg("gemini/gemini-3.5-flash-lite"), dev, []), estimateAgents(groqFree("groq/gpt-oss-120b"), dev, []), estimateJudge(cfg("gemini/gemma-4-31b"), 80)]);
    expect(text).toContain(`| gemini/gemini-3.5-flash-lite (agents) | ${dev.length} |`);
    expect(text).toMatch(new RegExp(`\\| groq/gpt-oss-120b \\(agents\\) \\| ${dev.length} \\|.*% of tok/day`));
    expect(text).toMatch(/\| gemini\/gemma-4-31b \(judge\) \| 80 \|/);
    expect(text).toContain("Agents run in parallel");
    expect(text).toMatch(/\| gemini\/gemini-3\.5-flash-lite \(agents\) \|.*\| no daily limit \(paid tier\) \|/);
    expect(text).toContain("Daily limit unknown for gemini/gemma-4-31b"); // no tier in its config
    expect(text).toContain("$0.00"); // Gemma (no pricing configured)
  });
});
