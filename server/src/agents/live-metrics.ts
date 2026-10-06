import { and, gte, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import type { TeamRole } from "../db/schema.ts";
import { costMicros } from "../llm/factory.ts";
import type { ModelConfig } from "../llm/config.ts";

/**
 * How each (role, model) did in real conversations recently: the "Live" block
 * on the Agents page. Computed from the traces (runs / run_steps), counting
 * only live sources (the demo widget and the CLI), never evals or tests.
 *
 * A role's work is its model calls: `router` steps for the router,
 * `model_call` steps for the agents. Latency is per model call, the only
 * timing recorded per role (a turn can span two agents after a handoff).
 */
export const LIVE_SOURCES = ["demo", "cli"] as const;

export type LiveMetrics = {
  role: TeamRole;
  model: string;
  /** Conversations in which this role made at least one call with this model. */
  conversations: number;
  /** Their outcomes (one per conversation; unfinished ones aren't counted). */
  outcomes: Record<(typeof s.RUN_OUTCOMES)[number], number>;
  /** failed / conversations with an outcome; null with none. */
  failureRate: number | null;
  calls: number;
  latencyMs: { p50: number | null; p95: number | null };
  inputTokens: number;
  outputTokens: number;
  /** From the uncached calls' tokens and the model's pricing in config/models.json, counting only calls made on a paid tier (tierChanges); null if the model isn't configured anymore. */
  costMicros: number | null;
};

const ROLE_STEP = sql`((${s.runSteps.kind} = 'router' and ${s.runSteps.agent} = 'router') or ${s.runSteps.kind} = 'model_call')`;

export async function liveMetrics(db: DbOrTx, since: Date, configs: readonly ModelConfig[]): Promise<LiveMetrics[]> {
  const liveRuns = db
    .select({ id: s.runs.id })
    .from(s.runs)
    .where(and(inArray(s.runs.source, [...LIVE_SOURCES]), gte(s.runs.startedAt, since)));

  const where = and(sql`${s.runSteps.runId} in ${liveRuns}`, ROLE_STEP, sql`${s.runSteps.modelConfigId} is not null`);
  // A call is priced only if it was made after the model's last move from a free
  // tier (tierChanges), so today's price isn't charged to free-tier history. A
  // date-only change counts from the start of that day, which may overstate it.
  const paidSince = configs.flatMap((c) => {
    const change = c.tierChanges?.filter((x) => x.from === "free").at(-1);
    return change ? [sql`when ${c.id} then ${s.runSteps.createdAt} >= ${new Date(change.on).toISOString()}::timestamptz`] : [];
  });
  const priced = paidSince.length ? sql`(case ${s.runSteps.modelConfigId} ${sql.join(paidSince, sql` `)} else true end)` : sql`true`;
  const totals = await db
    .select({
      role: s.runSteps.agent,
      model: s.runSteps.modelConfigId,
      conversations: sql<number>`count(distinct ${s.runSteps.runId})::int`,
      calls: sql<number>`count(*)::int`,
      p50: sql<number | null>`percentile_disc(0.5) within group (order by ${s.runSteps.latencyMs})`,
      p95: sql<number | null>`percentile_disc(0.95) within group (order by ${s.runSteps.latencyMs})`,
      inputTokens: sql<number>`coalesce(sum(${s.runSteps.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${s.runSteps.outputTokens}), 0)::int`,
      // Calls answered from the record/replay cache cost nothing, and neither do calls on a free tier.
      paidInput: sql<number>`coalesce(sum(${s.runSteps.inputTokens}) filter (where ${s.runSteps.cached} is not true and ${priced}), 0)::int`,
      paidOutput: sql<number>`coalesce(sum(${s.runSteps.outputTokens}) filter (where ${s.runSteps.cached} is not true and ${priced}), 0)::int`,
    })
    .from(s.runSteps)
    .where(where)
    .groupBy(s.runSteps.agent, s.runSteps.modelConfigId);

  // One outcome per conversation, so count distinct runs per (role, model, outcome).
  const outcomes = await db
    .select({
      role: s.runSteps.agent,
      model: s.runSteps.modelConfigId,
      outcome: s.runs.outcome,
      n: sql<number>`count(distinct ${s.runs.id})::int`,
    })
    .from(s.runSteps)
    .innerJoin(s.runs, sql`${s.runs.id} = ${s.runSteps.runId}`)
    .where(and(where, sql`${s.runs.outcome} is not null`))
    .groupBy(s.runSteps.agent, s.runSteps.modelConfigId, s.runs.outcome);

  return totals
    .map((t) => {
      const mix = { resolved: 0, escalated: 0, approval_needed: 0, failed: 0 };
      for (const o of outcomes) if (o.role === t.role && o.model === t.model && o.outcome) mix[o.outcome] = o.n;
      const finished = Object.values(mix).reduce((a, b) => a + b, 0);
      const config = configs.find((c) => c.id === t.model);
      return {
        role: t.role as TeamRole,
        model: t.model!,
        conversations: t.conversations,
        outcomes: mix,
        failureRate: finished ? mix.failed / finished : null,
        calls: t.calls,
        latencyMs: { p50: t.p50 === null ? null : Number(t.p50), p95: t.p95 === null ? null : Number(t.p95) },
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        costMicros: config ? costMicros(config, { inputTokens: t.paidInput, outputTokens: t.paidOutput }) : null,
      };
    })
    .sort((a, b) => a.role.localeCompare(b.role) || b.conversations - a.conversations);
}
