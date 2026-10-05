import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ComparisonSet, ModelReport, Rate, TeamChange } from "../lib/api.ts";
import { devGap, kpiTiles, latestDecision, shortModel, teamModel } from "./overview.ts";

const rate = (k: number, n: number, ci: [number, number] = [0, 1]): Rate => ({ k, n, rate: n ? k / n : 0, ci });

function report(model: string, k: number, n: number, policyViolations = 0): ModelReport {
  return {
    model,
    conversations: n,
    statuses: { pass: k, fail: n - k, script_mismatch: 0, judge_pending: 0, judge_failed: 0, provider_error: 0 },
    taskSuccess: rate(k, n, [0.5, 0.8]),
    routing: rate(n, n),
    byAgent: {},
    policyViolations,
    groundingViolations: 0,
    conversationsWithGrounding: rate(1, n, [0.01, 0.06]),
    escalation: rate(0, n),
    turnLatencyMs: { p50: 2600, p95: 5100 },
    costUsd: 0.96,
    health: { rejectedByProvider: 0, invalidArgs: 0, unknownTool: 0, garbledDelivered: 0 },
    quality: null,
  };
}

function set(models: ModelReport[], winner: ComparisonSet["winner"], split: ComparisonSet["split"] = "test"): ComparisonSet {
  return { id: "s", label: "S", split, runs: ["r"], judge: "j", promptSets: ["round-2"], models: models.map((report) => ({ model: report.model, report, repeats: [], repeatGap: null })), winner };
}

const change = (over: Partial<TeamChange>): TeamChange => ({
  id: 1,
  role: "support",
  action: "initial",
  model: "a/x",
  fromModel: null,
  toModel: "a/x",
  reason: "r",
  decidedBy: "admin",
  at: "2026-10-02T00:00:00Z",
  ...over,
});

describe("the tiles", () => {
  it("describe the team's model, with its count, interval and split", () => {
    const s = set([report("a/x", 79, 109, 1), report("a/y", 60, 110, 2)], { kind: "none", reason: "" });
    const tiles = kpiTiles(s, "a/y");
    expect(tiles[0]).toEqual({ label: "Task success · y (current team)", value: "55%", detail: "60 of 110 · 50–80% · test: held out", warn: false });
    expect(tiles[1]).toMatchObject({ value: "1 · 2", warn: true });
    expect(tiles.map((t) => t.label)).toEqual(["Task success · y (current team)", "Policy violations (must be 0)", "Invented facts (grounding)", "Reply time, median turn"]);
  });

  it("fall back to the best-scoring model, and say so, when the team's model wasn't evaluated", () => {
    const s = set([report("a/x", 79, 109), report("a/y", 60, 110)], { kind: "none", reason: "" });
    expect(kpiTiles(s, "a/other")[0]!.label).toBe("Task success · x (best scored; not on the team)");
    expect(teamModel([{ role: "router", model: "a/r" }, { role: "support", model: "a/s" }])).toBe("a/s");
  });
});

describe("the decision card", () => {
  it("is null until a switch, retire or reinstate exists", () => {
    expect(latestDecision([{ role: "support", history: [change({})] }], null)).toBeNull();
  });

  it("shows the latest change with the set's numbers for each model it involved", () => {
    const s = set([report("a/x", 79, 109), report("a/y", 60, 110)], { kind: "none", reason: "" });
    const history = [change({}), change({ id: 2, action: "switch", fromModel: "a/x", model: "a/y", toModel: "a/y", at: "2026-10-06T00:00:00Z" })];
    const d = latestDecision([{ role: "support", history }, { role: "router", history: [change({ role: "router", id: 3 })] }], s)!;
    expect(d.text).toBe("Switched a/x → a/y");
    expect(d.role).toBe("Orders & returns");
    expect(d.evidence).toEqual([
      { model: "x", text: "72% task success (50–80%, test: held out)" },
      { model: "y", text: "55% task success (50–80%, test: held out)" },
    ]);
  });
});

describe("the generated dev-vs-test finding", () => {
  it("compares each model's dev and test task success", () => {
    const test = set([report("a/x", 79, 109), report("a/y", 79, 110)], { kind: "none", reason: "" });
    const dev = set([report("a/x", 67, 79), report("a/y", 61, 80)], { kind: "none", reason: "" }, "dev");
    expect(devGap(test, dev)).toEqual({ title: "Held-out scores are lower than dev for every model", text: "Task success, dev (tuned on) → test (held out): x 85% → 72%, y 76% → 72%." });
    expect(devGap(test, null)).toBeNull();
    expect(devGap(dev, test)).toBeNull();
  });
});

describe("against the committed test-1 set: every number is the file's", () => {
  const file = (id: string) => JSON.parse(readFileSync(new URL(`../../../server/eval-results/comparisons/sets/${id}.json`, import.meta.url), "utf8")) as ComparisonSet;
  const test1 = file("test-1");
  const flash = test1.models.find((m) => m.model === "gemini/gemini-3.5-flash-lite")!.report;

  it("tiles", () => {
    const pctOf = (r: Rate) => `${Math.round(r.rate * 100)}%`;
    const tiles = kpiTiles(test1, "gemini/gemini-3.5-flash-lite");
    expect(tiles[0]!.value).toBe(pctOf(flash.taskSuccess));
    expect(tiles[0]!.detail).toContain(`${flash.taskSuccess.k} of ${flash.taskSuccess.n}`);
    expect(tiles[1]!.value).toBe(test1.models.map((m) => m.report.policyViolations).join(" · "));
    expect(tiles[2]!.value).toBe(pctOf(flash.conversationsWithGrounding));
    expect(tiles[3]!.detail).toContain(`$${flash.costUsd.toFixed(2)} for ${flash.conversations} conversations`);
    expect(shortModel(flash.model)).toBe("gemini-3.5-flash-lite");
  });

  it("the dev-vs-test finding uses the dev-round-2 set", () => {
    const dev = file("dev-round-2");
    const devFlash = dev.models.find((m) => m.model === flash.model)!.report.taskSuccess;
    expect(devGap(test1, dev)!.text).toContain(`gemini-3.5-flash-lite ${Math.round(devFlash.rate * 100)}% → ${Math.round(flash.taskSuccess.rate * 100)}%`);
  });
});
