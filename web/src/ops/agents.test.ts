import { describe, expect, it } from "vitest";
import type { ModelOption } from "../lib/api.ts";
import { costWarning, describeChange, evalCell, evalRows, ms, pct, retireTargets, switchTargets, tokens, usd } from "./agents.ts";

const model = (id: string, paid = false): ModelOption => ({ id, provider: id.split("/")[0]!, paid, pricing: paid ? { inputPerMTok: 0.15, outputPerMTok: 0.6 } : { inputPerMTok: 0, outputPerMTok: 0 } });
const MODELS = [model("gemini/lite"), model("groq/oss", true), model("groq/qwen", true)];

describe("agents display", () => {
  it("formats numbers", () => {
    expect([ms(420), ms(1834), ms(null)]).toEqual(["420 ms", "1.8 s", "–"]);
    expect([usd(0), usd(12345), usd(null)]).toEqual(["$0 (free)", "$0.0123", "–"]);
    expect([pct(0.256), pct(null)]).toEqual(["26%", "–"]);
    expect([tokens(999), tokens(12_400), tokens(3_400_000)]).toEqual(["999", "12K", "3.4M"]);
  });

  it("describes every kind of change", () => {
    expect(describeChange({ action: "initial", model: "a", fromModel: null, toModel: "a" })).toBe("Started with a");
    expect(describeChange({ action: "switch", model: "b", fromModel: "a", toModel: "b" })).toBe("Switched a → b");
    expect(describeChange({ action: "retire", model: "a", fromModel: "a", toModel: "b" })).toBe("Retired a, replaced by b");
    expect(describeChange({ action: "retire", model: "c", fromModel: "a", toModel: "a" })).toBe("Retired c");
    expect(describeChange({ action: "reinstate", model: "c", fromModel: "a", toModel: "a" })).toBe("Reinstated c");
  });

  it("offers only valid targets", () => {
    const role = { model: "gemini/lite", retired: ["groq/qwen"] };
    expect(switchTargets(role, MODELS).map((m) => m.id)).toEqual(["groq/oss"]);
    expect(retireTargets(role, MODELS).map((m) => m.id)).toEqual(["gemini/lite", "groq/oss"]);
  });

  it("warns before a paid model, not a free one", () => {
    expect(costWarning(MODELS[1])).toMatch(/paid model.*monthly cap \(Groq \$8, Gemini \$5\)/);
    expect(costWarning(MODELS[0])).toBeNull();
    expect(costWarning(undefined)).toBeNull();
  });

});

describe("the eval table on the Agents page (Julian, 2026-10-06)", () => {
  const rate = (k: number, n: number) => ({ k, n, rate: k / n, ci: [0.5, 0.9] as [number, number] });
  const stats = (conversations: number) => ({ conversations, outcomes: { resolved: conversations, approval_needed: 0, escalated: 0, failed: 0 }, failureRate: 0, calls: 1, latencyMs: { p50: 1, p95: 1 }, inputTokens: 1, outputTokens: 1, costMicros: 0 });
  // As on the site: Flash-Lite and gpt-oss from test-2; Qwen, retired before test-2, from test-1.
  const ev = {
    sets: [
      { id: "test-2", label: "Test set, round 3", split: "test" as const },
      { id: "test-1", label: "Test set, round-2 prompts", split: "test" as const },
    ],
    models: [
      { model: "gemini/lite", set: "test-2", taskSuccess: rate(85, 109), policyViolations: 0, byRole: { router: rate(106, 110), shopping: rate(33, 41), support: rate(47, 63) }, roleStats: { router: stats(110), shopping: stats(40), support: stats(66) } },
      { model: "groq/oss", set: "test-2", taskSuccess: rate(69, 110), policyViolations: 0, byRole: { router: rate(109, 110), shopping: rate(29, 41), support: rate(35, 64) }, roleStats: { router: stats(110), shopping: stats(43), support: stats(64) } },
      { model: "groq/qwen", set: "test-1", taskSuccess: rate(71, 109), policyViolations: 0, byRole: { router: rate(103, 110), shopping: rate(24, 41), support: rate(42, 63) }, roleStats: { router: stats(110), shopping: stats(38), support: stats(64) } },
    ],
  };
  const role = { role: "shopping" as const, model: "gemini/lite", retired: ["groq/qwen"], history: [] as any[] };

  it("lists every evaluated model: current first, then retired, then the rest, each with its set", () => {
    expect(evalRows(role, ev).map((r) => [r.model, r.status, r.set, r.figures?.conversations, r.success])).toEqual([
      ["gemini/lite", "current", "test-2", 40, "80% (33/41)"],
      ["groq/qwen", "retired", "test-1", 38, "59% (24/41)"],
      ["groq/oss", "other", "test-2", 43, "71% (29/41)"],
    ]);
  });

  it("marks a model switched out of the role", () => {
    const switched = { ...role, history: [{ action: "switch", fromModel: "groq/oss", toModel: "gemini/lite" }] as any[] };
    expect(evalRows(switched, ev).find((r) => r.model === "groq/oss")!.status).toBe("former");
  });

  it("keeps the current and retired models even without results, with nothing invented", () => {
    const rows = evalRows({ ...role, model: "groq/new", retired: ["groq/old"] }, ev);
    expect(rows.slice(0, 2)).toEqual([
      { model: "groq/new", status: "current", set: null, figures: null, success: null },
      { model: "groq/old", status: "retired", set: null, figures: null, success: null },
    ]);
    expect(evalRows(role, null)).toEqual([
      { model: "gemini/lite", status: "current", set: null, figures: null, success: null },
      { model: "groq/qwen", status: "retired", set: null, figures: null, success: null },
    ]);
    expect(evalCell(ev, "shopping", "groq/unknown")).toBeNull();
  });
});
