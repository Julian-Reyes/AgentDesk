import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { promptId } from "../../src/agents/prompts.ts";
import { JUDGE_RUBRIC } from "../../src/evals/judge/rubric.ts";
import { wilson } from "../../src/evals/judge/agreement.ts";
import { buildComparisonSet, loadAgentsPageSetIds, loadComparisonConfig, pickWinner, readComparisonSet } from "../../src/evals/runner/comparison-sets.ts";
import { writeRunReport, type RunReportJson } from "../../src/evals/runner/finish.ts";
import { DEFAULT_RESULTS_DIR, RunStore } from "../../src/evals/runner/store.ts";
import { getJudgeIds } from "../../src/llm/config.ts";

// The real committed runs are the fixtures: deterministic files, no model calls.
const JUDGE = { model: getJudgeIds().main, rubric: promptId(JUDGE_RUBRIC) };
const store = (run: string) => new RunStore(run);
const rate = (k: number, n: number) => ({ k, n, rate: n ? k / n : 0, ci: wilson(k, n) });

describe("the winner rule", () => {
  it("a model with a policy violation can't win, however high its task success", () => {
    const w = pickWinner([
      { model: "breaks-rules", taskSuccess: rate(39, 40), policyViolations: 1 },
      { model: "a", taskSuccess: rate(30, 40), policyViolations: 0 },
      { model: "b", taskSuccess: rate(10, 40), policyViolations: 0 },
    ]);
    expect(w).toEqual({ kind: "significant", model: "a", runnerUp: "b" });
  });

  it("overlapping 95% intervals: leads, not significant", () => {
    expect(pickWinner([{ model: "a", taskSuccess: rate(67, 79), policyViolations: 0 }, { model: "b", taskSuccess: rate(61, 80), policyViolations: 0 }])).toEqual({ kind: "not_significant", model: "a", runnerUp: "b" });
  });

  it("no winner when every model broke a rule or nothing was scored", () => {
    expect(pickWinner([{ model: "a", taskSuccess: rate(9, 10), policyViolations: 2 }])).toMatchObject({ kind: "none", reason: expect.stringContaining("policy violation") });
    expect(pickWinner([{ model: "a", taskSuccess: rate(0, 0), policyViolations: 0 }])).toMatchObject({ kind: "none" });
  });

  it("a single eligible model only leads; a model with nothing scored takes no part", () => {
    expect(pickWinner([{ model: "a", taskSuccess: rate(5, 10), policyViolations: 0 }, { model: "b", taskSuccess: rate(0, 0), policyViolations: 0 }])).toEqual({ kind: "not_significant", model: "a", runnerUp: null });
  });
});

describe("report.json", () => {
  it("is the same reports report.md renders", () => {
    const dir = mkdtempSync(join(tmpdir(), "runs-"));
    cpSync(join(DEFAULT_RESULTS_DIR, "dev-3-r2a"), join(dir, "dev-3-r2a"), { recursive: true });
    const s = new RunStore("dev-3-r2a", dir);
    const md = writeRunReport(s, JUDGE);
    const json = JSON.parse(readFileSync(join(s.dir, "report.json"), "utf8")) as RunReportJson;
    expect(json).toMatchObject({ run: "dev-3-r2a", split: "dev", promptSet: "round-2", judge: `${JUDGE.model}, ${JUDGE.rubric}` });
    // Row by row, the markdown shows the JSON's numbers in its model order.
    const row = (label: string) => md.split("\n").find((l) => l.startsWith(`| ${label}`))!;
    expect(row("Pass / fail / script mismatch")).toBe(`| Pass / fail / script mismatch | ${json.models.map((m) => `${m.statuses.pass} / ${m.statuses.fail} / ${m.statuses.script_mismatch}`).join(" | ")} |`);
    expect(row("**Policy violations**")).toBe(`| **Policy violations** (must be 0) | ${json.models.map((m) => m.policyViolations).join(" | ")} |`);
    expect(row("Cost")).toBe(`| Cost | ${json.models.map((m) => `$${m.costUsd.toFixed(2)}`).join(" | ")} |`);
    // And the committed files are what the current code writes.
    expect(md).toBe(readFileSync(join(DEFAULT_RESULTS_DIR, "dev-3-r2a", "report.md"), "utf8").trimEnd());
    expect(json).toEqual(JSON.parse(readFileSync(join(DEFAULT_RESULTS_DIR, "dev-3-r2a", "report.json"), "utf8")));
  });
});

describe("comparison sets", () => {
  it("a one-run set shows exactly that run's report numbers", () => {
    const set = buildComparisonSet({ id: "one", label: "one", split: "dev", runs: ["dev-3-r2a"] }, store, JUDGE);
    const json = JSON.parse(readFileSync(join(DEFAULT_RESULTS_DIR, "dev-3-r2a", "report.json"), "utf8")) as RunReportJson;
    expect(set.models.map((m) => m.report)).toEqual(json.models);
    expect(set.models.every((m) => m.repeatGap === null)).toBe(true);
  });

  it("pools repeats: counts add up, and the repeat gap is the spread between them", () => {
    const set = buildComparisonSet({ id: "r2", label: "r2", split: "dev", runs: ["dev-3-r2a", "dev-3-r2b"] }, store, JUDGE);
    for (const m of set.models) {
      const k = m.repeats.reduce((t, r) => t + r.taskSuccess.k, 0);
      const n = m.repeats.reduce((t, r) => t + r.taskSuccess.n, 0);
      expect([m.report.taskSuccess.k, m.report.taskSuccess.n]).toEqual([k, n]);
      const rates = m.repeats.map((r) => r.taskSuccess.rate);
      expect(m.repeatGap).toBeCloseTo(Math.max(...rates) - Math.min(...rates));
    }
    expect(set.promptSets).toEqual(["round-2"]);
  });

  it("refuses a run from another split, or one that doesn't exist", () => {
    expect(() => buildComparisonSet({ id: "x", label: "x", split: "test", runs: ["dev-3-r2a"] }, store, JUDGE)).toThrow(/dev split, not test/);
    expect(() => buildComparisonSet({ id: "x", label: "x", split: "dev", runs: ["nope"] }, store, JUDGE)).toThrow(/no run named nope/);
  });

  it("config/comparison.json is valid, and its committed set files are up to date (else: npm run eval:sets)", () => {
    for (const spec of loadComparisonConfig()) {
      expect(readComparisonSet(spec.id), spec.id).toEqual(JSON.parse(JSON.stringify(buildComparisonSet(spec, store, JUDGE))));
    }
  });

  it("rejects duplicate ids and unknown fields in the config", () => {
    const dir = mkdtempSync(join(tmpdir(), "cmp-"));
    const write = (v: unknown) => {
      writeFileSync(join(dir, "c.json"), JSON.stringify(v));
      return () => loadComparisonConfig(join(dir, "c.json"));
    };
    const set = { id: "a", label: "A", split: "dev", runs: ["dev-3-r2a"] };
    expect(write({ sets: [set, set] })).toThrow(/duplicate set id "a"/);
    expect(write({ sets: [{ ...set, models: ["x"] }] })).toThrow();
    expect(write({ sets: [{ ...set, split: "train" }] })).toThrow();
  });
});

describe("agentsPage in config/comparison.json (Julian, 2026-10-06)", () => {
  const write = (body: object) => {
    const p = join(mkdtempSync(join(tmpdir(), "cmp-")), "comparison.json");
    writeFileSync(p, JSON.stringify(body));
    return p;
  };
  const sets = [
    { id: "a", label: "A", split: "test", runs: ["r1"] },
    { id: "b", label: "B", split: "test", runs: ["r2"] },
  ];
  it("lists the sets in priority order; without it, the default set", () => {
    expect(loadAgentsPageSetIds(write({ sets, agentsPage: ["b", "a"] }))).toEqual(["b", "a"]);
    expect(loadAgentsPageSetIds(write({ sets }))).toEqual(["a"]);
  });
  it("refuses a set that isn't configured", () => {
    expect(() => loadAgentsPageSetIds(write({ sets, agentsPage: ["c"] }))).toThrow(/unknown set "c"/);
  });
  it("the live config: test-2, then test-1", () => {
    expect(loadAgentsPageSetIds()).toEqual(["test-2", "test-1"]);
  });
});
