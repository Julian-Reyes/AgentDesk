import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildTeam, loadTeamSpec } from "../../src/agents/team.ts";
import * as s from "../../src/db/schema.ts";
import { fixedClock } from "../../src/domain/clock.ts";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { createGradingCatalog } from "../../src/evals/grading/catalog.ts";
import { writeRunReport } from "../../src/evals/runner/finish.ts";
import { buildResults, modelReport } from "../../src/evals/runner/report.ts";
import { coverageNote } from "../../src/evals/runner/cli.ts";
import { judgeCoverage, judgeFor, providerErrorOf, questionSetOf, regrade, runAgentsStage, runJudgeStage, unjudged } from "../../src/evals/runner/stages.ts";
import { RunStore } from "../../src/evals/runner/store.ts";
import { applyCaseSnapshotUpdate, planCaseSnapshotUpdate } from "../../src/evals/runner/update-cases.ts";
import type { Observation } from "../../src/evals/run-case.ts";
import { FakeProvider, fake, type FakeStep } from "../../src/llm/fake.ts";
import type { ChatRequest } from "../../src/llm/types.ts";
import { MemoryTracer } from "../../src/tracing/tracer.ts";
import { promptId } from "../../src/agents/prompts.ts";
import { JUDGE_RUBRIC } from "../../src/evals/judge/rubric.ts";
import { db } from "../helpers.ts";

const RUBRIC = promptId(JUDGE_RUBRIC);

const catalog = createGradingCatalog();
const route = (r: string, message?: string) => fake.json({ route: r, category: "other", urgency: "normal", confidence: 0.9, ...(message ? { message } : {}) });
const cases = ["order-status-01", "order-status-03", "out-of-scope-01"].map((id) => ALL_CASES.find((c) => c.id === id)!);

/** A scripted "model" that answers these three cases correctly; `quotaAfter` makes it hit a daily quota. */
function goodScript(caseIds: string[]): { router: FakeStep[]; agent: FakeStep[] } {
  const router: FakeStep[] = [];
  const agent: FakeStep[] = [];
  for (const id of caseIds) {
    if (id === "order-status-01") {
      router.push(route("support"));
      agent.push(fake.tools(["get_order", { orderId: 1042 }]), fake.reply("Your order #1042 has shipped."));
    } else if (id === "order-status-03") {
      router.push(route("support"));
      agent.push(fake.tools(["get_order", { orderId: 1056 }]), fake.reply("Order #1056 is still processing, so it hasn't shipped yet."));
    } else if (id === "out-of-scope-01") {
      router.push(route("out_of_scope", "I can't help with weather, but I can help with gear and orders."));
    } else if (id === "refund-within-limit-01") {
      router.push(route("support"));
      agent.push(fake.tools(["issue_refund", { orderId: 1050, amount: 29, reason: "damaged", item: "lamp-glowworm-300" }]), fake.reply("Refunded $29.00 to your original payment method."));
    }
  }
  return { router, agent };
}

function teamWith(script: { router: FakeStep[]; agent: FakeStep[] }) {
  const agent = new FakeProvider(script.agent);
  return buildTeam(loadTeamSpec({ MODEL: "fake" }), { fakes: { router: new FakeProvider(script.router), shopping: agent, support: agent }, env: {} });
}

const newStore = () => new RunStore("t", mkdtempSync(join(tmpdir(), "evalrun-")));
const stage = (store: RunStore, teams: Record<string, ReturnType<typeof teamWith>>, cs = cases) =>
  runAgentsStage({ store, cases: cs, models: Object.keys(teams), teamFor: (m) => teams[m]!, db, tracer: new MemoryTracer(), clock: fixedClock("2026-09-15"), catalog, runName: "t" });

/** A judge that answers any input validly: every reply scored 4, every question "yes". */
function autoJudge(req: ChatRequest) {
  const user = String(req.messages[1]!.content);
  const replies = [...user.matchAll(/^Agent reply (\d+):/gm)].map((m) => ({ reply: Number(m[1]), tone: 4, clarity: 4, helpfulness: 4, why: "fine" }));
  const ids = (prefix: string) => [...user.matchAll(new RegExp(`^(${prefix}:[\\w-]+):`, "gm"))].map((m) => ({ id: m[1]!, answer: true, why: "yes" }));
  return fake.text(JSON.stringify({ replies, checks: ids("judge"), scriptFit: ids("script") }));
}

describe("the agents stage", () => {
  it("saves each conversation, runs models side by side, stops a model cleanly on a daily quota, and resumes", async () => {
    const store = newStore();
    const quota = new Error("fake/b: daily free-tier quota used up (HTTP 429). Try again tomorrow.");
    const b = goodScript(["order-status-01"]);
    const stopped = await stage(store, {
      "fake/a": teamWith(goodScript(cases.map((c) => c.id))),
      "fake/b": teamWith({ router: [...b.router, quota], agent: b.agent }),
    });
    expect(stopped).toEqual({ "fake/a": null, "fake/b": expect.stringMatching(/daily free-tier quota/) });
    expect(cases.map((c) => store.hasConversation("fake/a", c.id))).toEqual([true, true, true]);
    // The quota-hit case isn't saved as a failure; it's simply not done yet.
    expect(cases.map((c) => store.hasConversation("fake/b", c.id))).toEqual([true, false, false]);

    const saved = store.conversations().find((r) => r.agentModel === "fake/a" && r.caseId === "order-status-01")!;
    expect(saved.grade.codeStatus).toBe("pass");
    expect(saved.case.id).toBe("order-status-01");
    expect(saved.stats).toMatchObject({ modelCalls: 3, toolCalls: 1, inputTokens: 300, outputTokens: 60 });

    // Resume: only the two missing cases run for b; a has nothing left.
    const rest = goodScript(["order-status-03", "out-of-scope-01"]);
    const resumeA = new FakeProvider([]);
    await stage(store, { "fake/a": buildTeam(loadTeamSpec({ MODEL: "fake" }), { fakes: { router: resumeA, shopping: resumeA, support: resumeA }, env: {} }), "fake/b": teamWith(rest) });
    expect(resumeA.requests).toHaveLength(0);
    expect(cases.map((c) => store.hasConversation("fake/b", c.id))).toEqual([true, true, true]);
  });

  it("starts every conversation from the seeded store: refunds made during a case are rolled back", async () => {
    const store = newStore();
    const refundCase = ALL_CASES.find((c) => c.id === "refund-within-limit-01")!;
    await stage(store, { "fake/a": teamWith(goodScript([refundCase.id])) }, [refundCase]);
    const [rec] = store.conversations();
    expect(rec!.observation.effects.refunds).toHaveLength(1); // it happened inside the conversation...
    expect(rec!.grade.codeStatus).toBe("pass");
    expect(await db.select().from(s.refunds).where(eq(s.refunds.orderNumber, 1050))).toEqual([]); // ...and is gone now
  });
});

describe("the judge stage", () => {
  it("judges saved conversations once, caches the verdicts, and re-judges only with --force", async () => {
    const store = newStore();
    await stage(store, { "fake/a": teamWith(goodScript(cases.map((c) => c.id))) });
    const judge = new FakeProvider(Array.from({ length: 10 }, () => autoJudge));
    await runJudgeStage({ store, judgeModel: "judge/x", rubric: RUBRIC, provider: judge });
    expect(judge.requests).toHaveLength(3);
    expect(unjudged(store, "judge/x", RUBRIC)).toHaveLength(0);

    await runJudgeStage({ store, judgeModel: "judge/x", rubric: RUBRIC, provider: judge });
    expect(judge.requests).toHaveLength(3); // cached: no new calls
    await runJudgeStage({ store, judgeModel: "judge/x", rubric: RUBRIC, provider: judge, force: true });
    expect(judge.requests).toHaveLength(6);
    // A different judge or rubric version has its own verdicts.
    expect(unjudged(store, "judge/y", RUBRIC)).toHaveLength(3);
    expect(unjudged(store, "judge/x", "rubric@2#other")).toHaveLength(3);
  });

  it("the report: judge pending without the judge, pass with it; a stale verdict is ignored", async () => {
    const store = newStore();
    await stage(store, { "fake/a": teamWith(goodScript(cases.map((c) => c.id))) });

    // Without the judge nothing can pass: every conversation has the global judge checks.
    let results = buildResults(regrade(store.conversations()), () => null);
    expect(results.every((r) => r.status === "judge_pending")).toBe(true);
    const noJudge = modelReport("fake/a", results);
    expect(noJudge.taskSuccess).toMatchObject({ k: 0, n: 0 });
    expect(noJudge.codePass).toMatchObject({ k: 3, n: 3 });
    expect(noJudge.routing).toMatchObject({ k: 3, n: 3 });
    expect(noJudge.policyViolations).toBe(0);
    expect(noJudge.quality).toBeNull();
    expect(writeRunReport(store, null)).toContain("Judge: not run (`--no-judge`)");

    await runJudgeStage({ store, judgeModel: "judge/x", rubric: RUBRIC, provider: new FakeProvider(Array.from({ length: 3 }, () => autoJudge)) });
    results = buildResults(regrade(store.conversations()), (r) => judgeFor(store, "judge/x", RUBRIC, r));
    expect(results.every((r) => r.status === "pass")).toBe(true);
    const judged = modelReport("fake/a", results);
    expect(judged.quality!.tone).toMatchObject({ mean: 4, n: 3 });
    const md = writeRunReport(store, { model: "judge/x", rubric: RUBRIC });
    expect(md).toContain("| **Task success** (pass ÷ pass+fail) | 100% (3/3");

    // Re-running a conversation gives it a new run id; the old verdict no longer applies.
    const rec = store.conversations().find((r) => r.caseId === "order-status-03")!;
    store.saveConversation({ ...rec, observation: { ...rec.observation, runId: "a-new-run" } });
    expect(judgeFor(store, "judge/x", RUBRIC, regrade(store.conversations()).find((r) => r.caseId === "order-status-03")!)).toBeNull();
  });
});

describe("comparing two judges on the same run", () => {
  /** Like autoJudge, but stricter on order #1056: tone 2 and "no" on the timing check. */
  function strictJudge(req: ChatRequest) {
    const user = String(req.messages[1]!.content);
    if (!user.includes("#1056")) return autoJudge(req);
    const out = JSON.parse(String(autoJudge(req).message.content)) as { replies: { tone: number }[]; checks: { id: string; answer: boolean }[] };
    out.replies.forEach((r) => (r.tone = 2));
    out.checks.forEach((c) => (c.answer = c.id !== "judge:timing"));
    return fake.text(JSON.stringify(out));
  }

  it("the report shows status flips, who says no more often, and score agreement, on conversations both judged", async () => {
    const store = newStore();
    await stage(store, { "fake/a": teamWith(goodScript(cases.map((c) => c.id))) });
    await runJudgeStage({ store, judgeModel: "judge/x", rubric: RUBRIC, provider: new FakeProvider(Array.from({ length: 3 }, () => autoJudge)) });
    // The other judge only got to two of the three conversations.
    const two = new FakeProvider([autoJudge, strictJudge]);
    await runJudgeStage({ store, judgeModel: "judge/y", rubric: RUBRIC, provider: two, retryDelaysMs: [], sleep: async () => {} });
    store.saveJudge({ ...store.judgeRecord("judge/y", RUBRIC, "fake/a", "out-of-scope-01")!, ok: false, error: "provider error: HTTP 500" });

    const md = writeRunReport(store, { model: "judge/x", rubric: RUBRIC }, "judge/y");
    expect(md).toContain("## Judge comparison: judge/x (main) vs judge/y");
    expect(md).toContain("2 conversations have a valid verdict from both judges");
    expect(md).toContain("**Same final status:** 50% (1/2");
    expect(md).toContain("order-status-03 (fake/a): pass with judge/x, FAIL with judge/y");
    expect(md).toContain("judge/x said no where judge/y said yes: 0; the reverse: 1.");
    expect(md).toContain("order-status-03 (fake/a) judge:timing: judge/x yes, judge/y no");
    expect(md).toMatch(/\| tone \| 50% \(1\/2.*\| \+1\.00 \|/);
    // Without a second judge's verdicts there's no comparison section.
    expect(writeRunReport(store, { model: "judge/x", rubric: RUBRIC }, "judge/z")).not.toContain("Judge comparison");
  });
});

describe("judge reliability: slower retry passes, and question sets", () => {
  const http500 = () => Object.assign(new Error("gemini/gemma-4-31b: HTTP 500 Internal error encountered."), { name: "ProviderError" });

  it("a conversation that got a 500 is judged on a later, slower pass", async () => {
    const store = newStore();
    await stage(store, { "fake/a": teamWith(goodScript(cases.map((c) => c.id))) });
    // Pass 1: the second conversation fails; pass 2 (after the wait) succeeds.
    const judge = new FakeProvider([autoJudge, http500(), autoJudge, autoJudge]);
    const waits: number[] = [];
    const events: string[] = [];
    await runJudgeStage({ store, judgeModel: "judge/x", rubric: RUBRIC, provider: judge, retryDelaysMs: [60_000, 180_000], sleep: async (ms) => void waits.push(ms), onEvent: (e) => events.push(e.kind === "judged" ? `${e.caseId}:${e.result}` : e.kind) });
    expect(waits).toEqual([60_000]);
    expect(events).toEqual(["order-status-01:ok", "order-status-03:provider_error", "out-of-scope-01:ok", "retrying", "order-status-03:ok"]);
    expect(judgeCoverage(store, "judge/x", RUBRIC)).toEqual({ unjudged: 0, total: 3 });
  });

  it("after every pass fails, what's left is counted, with a warning above 10%", async () => {
    const store = newStore();
    await stage(store, { "fake/a": teamWith(goodScript(cases.map((c) => c.id))) });
    const judge = new FakeProvider([autoJudge, http500(), autoJudge, http500(), http500()]);
    await runJudgeStage({ store, judgeModel: "judge/x", rubric: RUBRIC, provider: judge, retryDelaysMs: [1, 1], sleep: async () => {} });
    const coverage = judgeCoverage(store, "judge/x", RUBRIC);
    expect(coverage).toEqual({ unjudged: 1, total: 3 });
    expect(coverageNote(coverage, "judge/x")).toMatch(/1 of 3 conversations \(33%\) still have no verdict[\s\S]*WARNING: that's over 10%/);
    expect(coverageNote({ unjudged: 1, total: 20 }, "judge/x")).not.toContain("WARNING");
    expect(coverageNote({ unjudged: 0, total: 20 }, "judge/x")).toContain("every conversation has a verdict");
  });

  it("a verdict only counts for the questions it answered", async () => {
    const store = newStore();
    await stage(store, { "fake/a": teamWith(goodScript(["order-status-01"])) }, [cases[0]!]);
    await runJudgeStage({ store, judgeModel: "judge/x", rubric: RUBRIC, provider: new FakeProvider([autoJudge]) });
    const [rec] = regrade(store.conversations());
    const verdict = judgeFor(store, "judge/x", RUBRIC, rec!)!;
    expect(verdict.questionSet).toBe(questionSetOf(rec!.grade.judgeQuestions));
    // Simulate a verdict made before the global checks existed: different questions, so it doesn't count.
    store.saveJudge({ ...verdict, questionSet: "00000000" });
    expect(judgeFor(store, "judge/x", RUBRIC, rec!)).toBeNull();
    expect(unjudged(store, "judge/x", RUBRIC)).toHaveLength(1);
  });
});

describe("telling provider trouble from model failure", () => {
  const withError = (data: Record<string, unknown>): Observation =>
    ({ runId: "x", turns: [], steps: [{ turn: 1, kind: "error", data }], finalAgent: null, outcome: "failed", effects: { refunds: [], goodwill: [], escalations: 0 } }) as Observation;

  it("network failures and 5xx are provider errors; a model that only produced unparseable output is not", () => {
    expect(providerErrorOf(withError({ name: "ProviderError", message: "groq: timed out", failedAttempts: [{ message: "timeout" }] }))).toBe("groq: timed out");
    expect(providerErrorOf(withError({ name: "ProviderError", message: "HTTP 400", failedAttempts: [{ code: "tool_use_failed" }, { code: "tool_use_failed" }] }))).toBeUndefined();
    expect(providerErrorOf(withError({ name: "Error", message: "No reply after 8 model calls (step limit)." }))).toBeUndefined();
  });
});

describe("applying approved case changes to a saved run", () => {
  const current = ALL_CASES.find((c) => c.id === "refund-within-limit-01")!;
  // The case as it was in dev-1: no goodwill coupon allowed.
  const old = structuredClone(current);
  old.expect.effects.allowed.goodwill = [];
  old.why = "old why";
  const couponScript = {
    router: [route("support")],
    agent: [
      fake.tools(["issue_refund", { orderId: 1050, amount: 29, reason: "damaged", item: "lamp-glowworm-300" }]),
      fake.tools(["issue_goodwill_coupon", { customer: "maya.chen@example.com", orderId: 1050, percent: 10, reason: "sorry" }]),
      fake.reply("Refunded $29.00 to your original payment method, and here's 10% off your next order."),
    ],
  };
  const savedRun = async () => {
    const store = newStore();
    store.saveManifest({ name: "t", split: "dev", models: ["fake/a"], caseIds: [old.id], createdAt: "2026-09-30T00:00:00Z" });
    await stage(store, { "fake/a": teamWith(couponScript) }, [old]);
    await runJudgeStage({ store, judgeModel: "judge/x", rubric: RUBRIC, provider: new FakeProvider([autoJudge]) });
    return store;
  };

  it("re-grades with the current case, keeps the old snapshot and the judge's verdict, and logs the update", async () => {
    const store = await savedRun();
    expect(regrade(store.conversations())[0]!.grade.counts.policyViolations).toBe(1);

    expect(planCaseSnapshotUpdate(store, ALL_CASES)).toEqual({
      changes: [{ model: "fake/a", caseId: old.id, fields: ["why", "expect.effects"] }],
      refused: [],
    });
    applyCaseSnapshotUpdate(store, ALL_CASES, "goodwill rule", "2026-10-01T00:00:00Z");

    const [r] = regrade(store.conversations());
    expect(r!.case).toEqual(current);
    expect(r!.caseHistory).toEqual([{ case: old, replacedAt: "2026-10-01T00:00:00Z", reason: "goodwill rule" }]);
    expect(r!.grade.counts.policyViolations).toBe(0);
    expect(judgeFor(store, "judge/x", RUBRIC, r!)).not.toBeNull(); // same questions, so the verdict still counts
    expect(store.manifest()!.caseUpdates).toEqual([{ at: "2026-10-01T00:00:00Z", reason: "goodwill rule", caseIds: [old.id] }]);
    expect(planCaseSnapshotUpdate(store, ALL_CASES).changes).toEqual([]); // nothing left to do
  });

  it("refuses, writing nothing, when the script or what the judge saw changed", async () => {
    const store = await savedRun();
    const edited = structuredClone(current);
    edited.expect.judgeChecks = ["A new question."];
    expect(planCaseSnapshotUpdate(store, [edited]).refused).toMatchObject([{ caseId: old.id, why: "judgeChecks changed: this needs a new run or a re-judge" }]);
    expect(() => applyCaseSnapshotUpdate(store, [edited], "x", "2026-10-01T00:00:00Z")).toThrow(/Refusing/);
    edited.turns = [{ customer: "Different message." }];
    expect(planCaseSnapshotUpdate(store, [edited]).refused[0]!.why).toBe("turns, judgeChecks changed: this needs a new run or a re-judge");
    expect(store.conversations()[0]!.case).toEqual(old);
    expect(store.manifest()!.caseUpdates).toBeUndefined();
  });

  it("with allowJudgeChecks, changed judge checks are applied and the old verdict stops counting; a changed judge note still refuses", async () => {
    const store = await savedRun();
    const edited = structuredClone(current);
    edited.expect.judgeChecks = ["A new question."];
    expect(planCaseSnapshotUpdate(store, [edited], { allowJudgeChecks: true }).changes).toEqual([
      { model: "fake/a", caseId: old.id, fields: ["why", "expect.effects", "expect.judgeChecks"], needsRejudge: true },
    ]);
    const noted = structuredClone(edited);
    noted.expect.judge = "A different note.";
    expect(planCaseSnapshotUpdate(store, [noted], { allowJudgeChecks: true }).refused[0]!.why).toBe("judge changed: this needs a new run or a re-judge");

    applyCaseSnapshotUpdate(store, [edited], "new wording", "2026-10-01T00:00:00Z", { allowJudgeChecks: true });
    const [r] = regrade(store.conversations());
    expect(judgeFor(store, "judge/x", RUBRIC, r!)).toBeNull();
    expect(unjudged(store, "judge/x", RUBRIC).map((x) => x.caseId)).toEqual([old.id]);
  });
});
