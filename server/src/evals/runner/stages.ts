import { createHash } from "node:crypto";
import type { Team } from "../../agents/team.ts";
import type { Db } from "../../db/client.ts";
import type { Clock } from "../../domain/clock.ts";
import { MODEL_OUTPUT_ERROR_CODES } from "../../llm/openai-compatible.ts";
import type { ChatProvider } from "../../llm/types.ts";
import type { Tracer } from "../../tracing/tracer.ts";
import type { EvalCase } from "../case-schema.ts";
import type { GroundingCatalog } from "../grading/grounding.ts";
import { createGradingCatalog } from "../grading/catalog.ts";
import { gradeCase, type JudgeQuestion } from "../grading/grade.ts";
import { buildJudgeInput, runJudge } from "../judge/judge.ts";
import { runCase, type Observation } from "../run-case.ts";
import type { ConversationRecord, ConversationStats, JudgeRecord, RunStore } from "./store.ts";

/**
 * The two stages of an eval run.
 *  1. Agents: every (model, case) conversation, each in its own rolled-back
 *     transaction (so every case starts from the same seeded store), graded by
 *     code and saved as a checkpoint file. Models run in parallel, since each has
 *     its own quota; cases run one at a time per model.
 *  2. Judge: every saved conversation not yet judged by this judge model and
 *     rubric. Separate, so saved runs can be re-judged without replaying agents.
 */

export const DAILY_QUOTA = /daily free-tier quota used up/;

class Rollback extends Error {}

/** Runs fn in a transaction that is always rolled back: the store is unchanged afterwards. */
export async function withRollback<T>(db: Db, fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>): Promise<T> {
  let result: T;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return result!;
}

export function statsOf(obs: Observation, wallMs: number): ConversationStats {
  const calls = obs.steps.filter((s) => s.kind === "model_call" || s.kind === "router");
  const turnLatencyMs = obs.turns.map((_, i) => calls.filter((s) => s.turn === i + 1).reduce((n, s) => n + (s.latencyMs ?? 0), 0));
  return {
    modelCalls: calls.length,
    cachedCalls: calls.filter((s) => s.cached).length,
    toolCalls: obs.steps.filter((s) => s.kind === "tool_call" && (s.data as { name: string }).name !== "reply").length,
    inputTokens: calls.reduce((n, s) => n + (s.inputTokens ?? 0), 0),
    outputTokens: calls.reduce((n, s) => n + (s.outputTokens ?? 0), 0),
    latencyMs: turnLatencyMs.reduce((a, b) => a + b, 0),
    turnLatencyMs,
    costMicros: calls.reduce((n, s) => n + (s.costMicros ?? 0), 0),
    wallMs,
  };
}

/**
 * A turn that failed because the provider was unreachable or kept erroring is
 * an infrastructure problem, reported separately. If every failed attempt was
 * the model's own unparseable output, it's the model's failure and counts.
 */
export function providerErrorOf(obs: Observation): string | undefined {
  for (const s of obs.steps) {
    if (s.kind !== "error" || (s.data as { name?: string }).name !== "ProviderError") continue;
    const attempts = ((s.data as { failedAttempts?: { code?: string }[] }).failedAttempts ?? []);
    if (attempts.length && attempts.every((a) => MODEL_OUTPUT_ERROR_CODES.has(a.code ?? ""))) continue;
    return String((s.data as { message?: string }).message);
  }
  return undefined;
}

export type AgentEvent =
  | { kind: "done"; model: string; caseId: string; index: number; total: number; status: "pass" | "fail"; wallMs: number; providerError?: string }
  | { kind: "stopped"; model: string; reason: string; remaining: number }
  | { kind: "finished"; model: string };

export type AgentsStageOptions = {
  store: RunStore;
  cases: EvalCase[];
  models: string[];
  teamFor: (model: string) => Team;
  db: Db;
  tracer: Tracer;
  clock: Clock;
  catalog: GroundingCatalog;
  runName: string;
  onEvent?: (e: AgentEvent) => void;
  now?: () => number;
};

/** Returns, per model, why it stopped early (daily quota), if it did. */
export async function runAgentsStage(o: AgentsStageOptions): Promise<Record<string, string | null>> {
  const now = o.now ?? (() => performance.now());
  const worker = async (model: string): Promise<string | null> => {
    const todo = o.cases.filter((c) => !o.store.hasConversation(model, c.id));
    const team = o.teamFor(model);
    for (const [i, c] of todo.entries()) {
      const started = now();
      const obs = await withRollback(o.db, (tx) =>
        runCase(c, { db: tx, clock: o.clock, team, tracer: o.tracer, source: "eval", labels: { evalRun: o.runName, agentModel: model } }),
      );
      const quota = obs.turns.find((t) => t.error && DAILY_QUOTA.test(t.error));
      if (quota) {
        // Not the model's fault and not a result: leave the case unsaved so a later resume runs it.
        const reason = quota.error!;
        o.onEvent?.({ kind: "stopped", model, reason, remaining: todo.length - i });
        return reason;
      }
      const grade = gradeCase(c, obs, o.catalog);
      const providerError = providerErrorOf(obs);
      const wallMs = Math.round(now() - started);
      const record: ConversationRecord = {
        caseId: c.id,
        case: c,
        agentModel: model,
        team: team.meta,
        observation: obs,
        grade,
        stats: statsOf(obs, wallMs),
        ...(providerError ? { providerError } : {}),
        finishedAt: new Date().toISOString(),
      };
      o.store.saveConversation(record);
      o.onEvent?.({ kind: "done", model, caseId: c.id, index: i + 1, total: todo.length, status: grade.codeStatus, wallMs, ...(providerError ? { providerError } : {}) });
    }
    o.onEvent?.({ kind: "finished", model });
    return null;
  };
  const results = await Promise.all(o.models.map(async (m) => [m, await worker(m)] as const));
  return Object.fromEntries(results);
}

export type JudgeEvent =
  | { kind: "judged"; model: string; caseId: string; index: number; total: number; result: "ok" | "judge_failed" | "provider_error"; latencyMs: number }
  | { kind: "stopped"; reason: string; remaining: number }
  | { kind: "retrying"; count: number; waitMs: number; pass: number };

export type JudgeStageOptions = {
  store: RunStore;
  judgeModel: string;
  rubric: string;
  provider: ChatProvider;
  /** Re-judge even conversations that already have a result for this judge and rubric. */
  force?: boolean;
  onEvent?: (e: JudgeEvent) => void;
  /** Waits before each extra pass over provider errors. Default: 1 min, then 3 min. */
  retryDelaysMs?: number[];
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Saved conversations graded by the current grader. Grading is pure code over
 * the saved observation and case snapshot, so this makes no model calls; it's
 * how grader changes (e.g. new global judge checks) reach runs saved earlier.
 */
export function regrade(records: ConversationRecord[], catalog: GroundingCatalog = defaultCatalog()): ConversationRecord[] {
  return records.map((r) => ({ ...r, grade: gradeCase(r.case, r.observation, catalog) }));
}
let cachedCatalog: GroundingCatalog | undefined;
const defaultCatalog = () => (cachedCatalog ??= createGradingCatalog());

/** A short hash of the questions a verdict answered. If the questions change, the old verdict no longer applies. */
export function questionSetOf(questions: JudgeQuestion[]): string {
  const key = questions.map((q) => (q.kind === "judge_check" ? `${q.id}=${q.statement}` : `${q.id}=${q.assumes}`)).join("\n");
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/**
 * The judge's verdict for this exact conversation (same run id) and these exact
 * questions, or null. With includeFailed, provider-error records too.
 */
export function judgeFor(store: RunStore, judgeModel: string, rubric: string, r: ConversationRecord, includeFailed = false): JudgeRecord | null {
  const j = store.judgeRecord(judgeModel, rubric, r.agentModel, r.caseId);
  if (!j || j.runId !== r.observation.runId || j.questionSet !== questionSetOf(r.grade.judgeQuestions)) return null;
  return includeFailed || j.ok || !isProviderError(j) ? j : null;
}

const isProviderError = (j: JudgeRecord) => !j.ok && (j.error ?? "").startsWith("provider error");

/** Conversations (re-graded) the judge still has to do. */
export function unjudged(store: RunStore, judgeModel: string, rubric: string, force = false): ConversationRecord[] {
  return regrade(store.conversations()).filter((r) => {
    if (force) return true;
    const j = judgeFor(store, judgeModel, rubric, r, true);
    // Provider trouble isn't a verdict: try those again. Invalid judge output is (judge_failed), so it stays.
    return !j || isProviderError(j);
  });
}

/**
 * Judges every conversation that needs it. Gemma's free endpoint returns HTTP
 * 500s intermittently (5 of 13 pilot attempts failed, even after the client's
 * 4 quick retries), so conversations that end in a provider error get more
 * passes after a longer wait (retryDelaysMs, default 1 then 3 minutes).
 * Returns the daily-quota message if the judge ran out, else null.
 */
export async function runJudgeStage(o: JudgeStageOptions): Promise<string | null> {
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const delays = o.retryDelaysMs ?? [60_000, 180_000];
  let todo = unjudged(o.store, o.judgeModel, o.rubric, o.force);
  for (let pass = 0; pass <= delays.length && todo.length; pass++) {
    if (pass > 0) {
      o.onEvent?.({ kind: "retrying", count: todo.length, waitMs: delays[pass - 1]!, pass });
      await sleep(delays[pass - 1]!);
    }
    const failed: ConversationRecord[] = [];
    for (const [i, r] of todo.entries()) {
      const j = await judgeOne(o, r);
      if (j.result === "quota") {
        o.onEvent?.({ kind: "stopped", reason: j.reason, remaining: todo.length - i });
        return j.reason;
      }
      if (j.result === "provider_error") failed.push(r);
      o.onEvent?.({ kind: "judged", model: r.agentModel, caseId: r.caseId, index: i + 1, total: todo.length, result: j.result, latencyMs: j.latencyMs });
    }
    todo = failed;
  }
  return null;
}

type JudgeOutcome = { result: "quota"; reason: string } | { result: "ok" | "judge_failed" | "provider_error"; latencyMs: number };

async function judgeOne(o: JudgeStageOptions, r: ConversationRecord): Promise<JudgeOutcome> {
  const input = buildJudgeInput(r.case, r.observation, r.grade.judgeQuestions);
  let result: Awaited<ReturnType<typeof runJudge>>;
  try {
    result = await runJudge(o.provider, input);
  } catch (e) {
    const reason = (e as Error).message;
    if (DAILY_QUOTA.test(reason)) return { result: "quota", reason };
    // Provider trouble on one conversation: recorded, and retried in a later pass or run.
    result = { ok: false, rubric: o.rubric, error: `provider error: ${reason}`, calls: [] };
  }
  const rec: JudgeRecord = {
    caseId: r.caseId,
    runId: r.observation.runId,
    questionSet: questionSetOf(r.grade.judgeQuestions),
    agentModel: r.agentModel,
    judgeModel: o.judgeModel,
    rubric: result.rubric,
    input,
    ok: result.ok,
    ...(result.ok ? { output: result.output, answers: result.answers } : { error: result.error }),
    calls: result.calls.map((c) => ({
      purpose: c.purpose,
      latencyMs: c.response.latencyMs,
      inputTokens: c.response.usage.inputTokens,
      outputTokens: c.response.usage.outputTokens,
      cached: c.response.cached ?? false,
      raw: c.raw,
      ...(c.error ? { error: c.error } : {}),
    })),
  };
  o.store.saveJudge(rec);
  const latencyMs = rec.calls.reduce((n, c) => n + c.latencyMs, 0);
  return { result: result.ok ? "ok" : isProviderError(rec) ? "provider_error" : "judge_failed", latencyMs };
}

/** How many conversations still have no verdict (provider errors), for the >10% warning. */
export function judgeCoverage(store: RunStore, judgeModel: string, rubric: string): { unjudged: number; total: number } {
  const all = store.conversations().length;
  return { unjudged: unjudged(store, judgeModel, rubric).length, total: all };
}
