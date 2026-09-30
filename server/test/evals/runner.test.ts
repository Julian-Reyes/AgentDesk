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
import { judgeFor, providerErrorOf, runAgentsStage, runJudgeStage, unjudged } from "../../src/evals/runner/stages.ts";
import { RunStore } from "../../src/evals/runner/store.ts";
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
  const ids = (prefix: string) => [...user.matchAll(new RegExp(`^(${prefix}:\\d+):`, "gm"))].map((m) => ({ id: m[1]!, answer: true, why: "yes" }));
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

    // Without the judge: order-status-03 has a judge check, so it can't pass yet.
    let results = buildResults(store.conversations(), () => null);
    expect(Object.fromEntries(results.map((r) => [r.record.caseId, r.status]))).toEqual({ "order-status-01": "pass", "order-status-03": "judge_pending", "out-of-scope-01": "pass" });
    const noJudge = modelReport("fake/a", results);
    expect(noJudge.taskSuccess).toMatchObject({ k: 2, n: 2 });
    expect(noJudge.codePass).toMatchObject({ k: 3, n: 3 });
    expect(noJudge.routing).toMatchObject({ k: 3, n: 3 });
    expect(noJudge.policyViolations).toBe(0);
    expect(noJudge.quality).toBeNull();
    expect(writeRunReport(store, null)).toContain("Judge: not run (`--no-judge`)");

    await runJudgeStage({ store, judgeModel: "judge/x", rubric: RUBRIC, provider: new FakeProvider(Array.from({ length: 3 }, () => autoJudge)) });
    results = buildResults(store.conversations(), (r) => judgeFor(store, "judge/x", RUBRIC, r));
    expect(results.every((r) => r.status === "pass")).toBe(true);
    const judged = modelReport("fake/a", results);
    expect(judged.quality!.tone).toMatchObject({ mean: 4, n: 3 });
    const md = writeRunReport(store, { model: "judge/x", rubric: RUBRIC });
    expect(md).toContain("| **Task success** (pass ÷ pass+fail) | 100% (3/3");

    // Re-running a conversation gives it a new run id; the old verdict no longer applies.
    const rec = store.conversations().find((r) => r.caseId === "order-status-03")!;
    store.saveConversation({ ...rec, observation: { ...rec.observation, runId: "a-new-run" } });
    expect(judgeFor(store, "judge/x", RUBRIC, store.conversations().find((r) => r.caseId === "order-status-03")!)).toBeNull();
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
