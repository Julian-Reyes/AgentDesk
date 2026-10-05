import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { promptId } from "../agents/prompts.ts";
import * as s from "../db/schema.ts";
import { JUDGE_RUBRIC } from "../evals/judge/rubric.ts";
import { runResults } from "../evals/runner/finish.ts";
import { DEFAULT_RESULTS_DIR, RunStore } from "../evals/runner/store.ts";
import { getJudgeIds } from "../llm/config.ts";
import { fail, ok } from "../tools/define.ts";
import type { AppDeps } from "./app.ts";

/**
 * The Runs page: every traced conversation, step by step.
 *  - Live: runs in the database (demo widget, CLI, and the eval runner's own
 *    traces), newest first, paged with a cursor. Mounted under /api/admin/runs:
 *    a live trace shows what the visitor typed, so only an admin sees it
 *    (Julian, 2026-10-02).
 *  - Eval: saved eval runs read from their files (RunStore), graded with the
 *    current grader and judged by the main judge, exactly as their reports
 *    are. Files, not the database, so eval traces work wherever the files are
 *    (the deployed DB won't have them, M5).
 * Eval runs are public and read-only, like the rest of the dashboard.
 */

export type RunsDeps = { resultsDir: string; judge: () => { model: string; rubric: string } };

export const runsDeps = (deps: AppDeps): RunsDeps => ({
  resultsDir: DEFAULT_RESULTS_DIR,
  judge: () => ({ model: getJudgeIds().main, rubric: promptId(JUDGE_RUBRIC) }),
  ...deps.runs,
});

// ---------- Live (database) ----------

const LiveQuery = z.object({
  /** One source or a comma-separated list, e.g. "demo,cli" (the page's default: real conversations, not the eval runner's). */
  source: z.string().regex(/^[a-z]+(,[a-z]+)*$/).optional(),
  outcome: z.enum(s.RUN_OUTCOMES).optional(),
  model: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  before: z.string().optional(),
});

/** The paging cursor: the last row's (startedAt, id), so rows started in the same millisecond aren't skipped. */
const Cursor = z.object({ at: z.iso.datetime(), id: z.string() });
const encodeCursor = (c: z.infer<typeof Cursor>) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decodeCursor(raw: string) {
  try {
    return Cursor.parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

export function runRoutes(deps: AppDeps) {
  return new Hono()
    .get("/", async (c) => {
      const q = LiveQuery.safeParse(c.req.query());
      if (!q.success) return c.json(fail("INVALID_QUERY", "Use source, outcome, model, limit (1–100) and before."), 400);
      const { source, outcome, model, limit, before } = q.data;
      const cursor = before ? decodeCursor(before) : undefined;
      if (cursor === null) return c.json(fail("INVALID_QUERY", "Invalid cursor."), 400);

      const where = and(
        source ? inArray(s.runs.source, source.split(",")) : undefined,
        outcome ? eq(s.runs.outcome, outcome) : undefined,
        // Any role using that model (the team is {role: {model, ...}}).
        model ? sql`exists (select 1 from jsonb_each(${s.runs.team}) t where t.value->>'model' = ${model})` : undefined,
        cursor ? or(lt(s.runs.startedAt, new Date(cursor.at)), and(eq(s.runs.startedAt, new Date(cursor.at)), lt(s.runs.id, cursor.id))) : undefined,
      );
      // Written out with an alias: drizzle leaves columns unqualified inside a subquery, so "id" would mean run_steps.id.
      const firstMessage = sql<string | null>`(select fm.data->>'text' from run_steps fm where fm.run_id = "runs"."id" and fm.kind = 'user_message' order by fm.seq limit 1)`;
      const rows = await deps.db
        .select({ run: s.runs, firstMessage })
        .from(s.runs)
        .where(where)
        .orderBy(desc(s.runs.startedAt), desc(s.runs.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return c.json(
        ok({
          runs: page.map(({ run, firstMessage }) => ({
            ...summarizeRun(run),
            firstMessage: firstMessage && firstMessage.length > 140 ? `${firstMessage.slice(0, 140)}…` : firstMessage,
          })),
          next: rows.length > limit && last ? encodeCursor({ at: last.run.startedAt.toISOString(), id: last.run.id }) : null,
        }),
      );
    })
    .get("/:id", async (c) => {
      const id = c.req.param("id");
      const [run] = await deps.db.select().from(s.runs).where(eq(s.runs.id, id));
      if (!run) return c.json(fail("NOT_FOUND", `No run ${id}.`), 404);
      const steps = await deps.db.select().from(s.runSteps).where(eq(s.runSteps.runId, id)).orderBy(asc(s.runSteps.seq));
      return c.json(ok({ run: summarizeRun(run), steps: steps.map(({ id: _, runId: __, createdAt, ...st }) => ({ ...st, at: createdAt.toISOString() })) }));
    });
}

function summarizeRun(run: typeof s.runs.$inferSelect) {
  return {
    id: run.id,
    source: run.source,
    customerId: run.customerId,
    labels: run.labels,
    team: run.team,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt?.toISOString() ?? null,
    outcome: run.outcome,
    turns: run.turns,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    costMicros: run.costMicros,
  };
}

// ---------- Eval (files) ----------

/** Run names come from the directory listing, never straight from the URL, so a name can't point outside the results folder. */
function evalRunNames(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "manifest.json")))
    .map((d) => d.name)
    .sort();
}

/** A saved eval run, or null if there's no run of that name. */
export const openEvalRun = (r: RunsDeps, name: string) => (evalRunNames(r.resultsDir).includes(name) ? new RunStore(name, r.resultsDir) : null);

export type RunJudge = { model: string; rubric: string; legacy: boolean };

/**
 * Which judge a run is shown with: the main judge if it judged this run;
 * otherwise the run's own judge, marked legacy. pilot-1 was judged only by
 * Gemma 4 31B with rubric@1, before the switch to gpt-oss-20b. Shown with the
 * main judge, every one of its conversations would read "judge pending"; shown
 * with its own judge, it matches its report, and the page says it's an older
 * setup (Julian, 2026-10-05).
 */
export function runJudge(r: RunsDeps, store: RunStore): RunJudge {
  const main = r.judge();
  const own = store.judges();
  if (own.length === 0 || own.some((j) => j.model === main.model && j.rubric === main.rubric)) return { ...main, legacy: false };
  const sameModel = own.filter((j) => j.model === main.model);
  return { ...(sameModel.at(-1) ?? own.at(-1)!), legacy: true };
}

/**
 * A run's conversations graded with the current grader and judged by its
 * judge (runJudge), exactly as the Runs page shows them; null if there's no
 * such run. Shared with the overview page, which checks its examples here.
 */
export function evalResults(r: RunsDeps, name: string) {
  const store = openEvalRun(r, name);
  if (!store) return null;
  const judge = runJudge(r, store);
  return { ...runResults(store, judge), judge };
}

/**
 * Looks up saved conversations by run, model and case, grading each run once
 * (a page of examples may point into the same run many times). Returns the
 * conversation only if it passed, graded and judged as the Runs page shows it.
 */
export function passedConversations(r: RunsDeps) {
  const runs = new Map<string, ReturnType<typeof evalResults>>();
  return (run: string, model: string, caseId: string) => {
    if (!runs.has(run)) runs.set(run, evalResults(r, run));
    const x = runs.get(run)?.results.find((y) => y.record.agentModel === model && y.record.caseId === caseId);
    return x?.status === "pass" ? x : null;
  };
}

const STATUSES = ["pass", "fail", "script_mismatch", "judge_pending", "judge_failed", "provider_error"] as const;
const ConvQuery = z.object({ model: z.string().optional(), status: z.enum(STATUSES).optional() });
const OneQuery = z.object({ model: z.string().min(1), case: z.string().min(1) });

export function evalRunRoutes(deps: AppDeps) {
  const r = runsDeps(deps);

  return new Hono()
    .get("/", (c) => {
      const runs = evalRunNames(r.resultsDir).map((name) => {
        const store = new RunStore(name, r.resultsDir);
        const m = store.manifest()!;
        return { name, split: m.split, promptSet: m.promptSet ?? null, models: m.models, cases: m.caseIds.length, createdAt: m.createdAt, judge: runJudge(r, store) };
      });
      return c.json(ok({ runs: runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), judge: r.judge() }));
    })
    .get("/:run/conversations", (c) => {
      const graded = evalResults(r, c.req.param("run"));
      if (!graded) return c.json(fail("NOT_FOUND", `No eval run ${c.req.param("run")}.`), 404);
      const q = ConvQuery.safeParse(c.req.query());
      if (!q.success) return c.json(fail("INVALID_QUERY", `status must be one of: ${STATUSES.join(", ")}.`), 400);
      const { results, models, judge } = graded;
      const rows = results
        .filter((x) => (!q.data.model || x.record.agentModel === q.data.model) && (!q.data.status || x.status === q.data.status))
        .map((x) => ({
          caseId: x.record.caseId,
          type: x.record.case.type,
          model: x.record.agentModel,
          status: x.status,
          outcome: x.record.observation.outcome,
          failedChecks: x.record.grade.checks.filter((k) => !k.pass).map((k) => ({ id: k.id, severity: k.severity })),
          judgeNo: Object.entries(x.judge?.ok ? (x.judge.answers ?? {}) : {}).filter(([, a]) => a === false).map(([id]) => id),
          policyViolations: x.record.grade.counts.policyViolations,
          groundingViolations: x.record.grade.counts.groundingViolations,
        }));
      return c.json(ok({ run: c.req.param("run"), models, judge, conversations: rows }));
    })
    .get("/:run/conversation", (c) => {
      const graded = evalResults(r, c.req.param("run"));
      if (!graded) return c.json(fail("NOT_FOUND", `No eval run ${c.req.param("run")}.`), 404);
      const q = OneQuery.safeParse(c.req.query());
      if (!q.success) return c.json(fail("INVALID_QUERY", "Give model and case."), 400);
      const { results, judge: judgeShown } = graded;
      const x = results.find((y) => y.record.agentModel === q.data.model && y.record.caseId === q.data.case);
      if (!x) return c.json(fail("NOT_FOUND", `No conversation for ${q.data.case} with ${q.data.model} in ${c.req.param("run")}.`), 404);
      const { record, judge, status } = x;
      return c.json(
        ok({
          run: c.req.param("run"),
          status,
          judge: judgeShown,
          case: record.case,
          caseHistory: record.caseHistory ?? [],
          model: record.agentModel,
          team: record.team,
          outcome: record.observation.outcome,
          effects: record.observation.effects,
          steps: record.observation.steps,
          grade: { checks: record.grade.checks, counts: record.grade.counts, judgeQuestions: record.grade.judgeQuestions },
          verdict: judge ? { ok: judge.ok, output: judge.output ?? null, error: judge.error ?? null } : null,
          stats: record.stats,
          providerError: record.providerError ?? null,
        }),
      );
    });
}
