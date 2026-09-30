import { eq } from "drizzle-orm";
import { Conversation } from "../agents/conversation.ts";
import type { Team } from "../agents/team.ts";
import type { DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import type { Clock } from "../domain/clock.ts";
import type { AgentName } from "../tools/define.ts";
import type { RunMeta, RunOutcome, RunTrace, StepRecord, Tracer } from "../tracing/tracer.ts";
import type { EvalCase } from "./case-schema.ts";
import { effectsSince, snapshotStore, type ObservedEffects } from "./grading/effects.ts";

/**
 * Plays one eval case's scripted messages through the real conversation loop
 * and collects everything the graders need. The eval runner (M3 step 5) wraps
 * this with a rolled-back transaction, checkpoints and rate limits; tests call
 * it directly with fake models.
 */

export type ObservedTurn = { customer: string; reply: string; answeredBy: string; outcome: RunOutcome; error?: string };

export type Observation = {
  runId: string;
  turns: ObservedTurn[];
  /** The run's trace steps, in order (the same records the tracer stored). */
  steps: StepRecord[];
  /** The agent holding the conversation at the end, or null if the Router answered everything. */
  finalAgent: AgentName | null;
  outcome: RunOutcome;
  effects: ObservedEffects;
};

export type RunCaseDeps = {
  /** Store data; should be a transaction the caller rolls back afterwards. */
  db: DbOrTx;
  clock: Clock;
  team: Team;
  tracer: Tracer;
  source?: string;
  labels?: Record<string, unknown>;
};

const RANK: Record<RunOutcome, number> = { resolved: 0, approval_needed: 1, escalated: 2, failed: 3 };

/** Forwards to another tracer and keeps a copy of every step, so the graders don't need to read traces back. */
class RecordingTracer implements Tracer {
  readonly steps: StepRecord[] = [];
  private readonly inner: Tracer;
  constructor(inner: Tracer) {
    this.inner = inner;
  }
  async startRun(meta: RunMeta): Promise<RunTrace> {
    const run = await this.inner.startRun(meta);
    return {
      id: run.id,
      step: async (step) => {
        this.steps.push(step);
        await run.step(step);
      },
      finish: (summary) => run.finish(summary),
    };
  }
}

export async function runCase(c: EvalCase, deps: RunCaseDeps): Promise<Observation> {
  let customer: { id: number; name: string; email: string } | null = null;
  if (c.customer) {
    const [row] = await deps.db.select().from(s.customers).where(eq(s.customers.email, c.customer));
    if (!row) throw new Error(`Eval case ${c.id}: no customer ${c.customer} in the store (is the database seeded?)`);
    customer = row;
  }

  const snapshot = await snapshotStore(deps.db);
  const tracer = new RecordingTracer(deps.tracer);
  const convo = await Conversation.start({
    db: deps.db,
    clock: deps.clock,
    session: { customerId: customer?.id ?? null },
    customer: customer ? { name: customer.name, email: customer.email } : null,
    router: deps.team.router,
    agents: deps.team.agents,
    tracer,
    source: deps.source ?? "eval",
    team: deps.team.meta,
    labels: { caseId: c.id, split: c.split, type: c.type, ...deps.labels },
  });

  const turns: ObservedTurn[] = [];
  let outcome: RunOutcome = "resolved";
  // The script is fixed: every message is sent, whatever the agent replied.
  for (const t of c.turns) {
    const r = await convo.send(t.customer);
    turns.push({ customer: t.customer, reply: r.reply, answeredBy: r.answeredBy, outcome: r.outcome, ...(r.error ? { error: r.error } : {}) });
    if (RANK[r.outcome] > RANK[outcome]) outcome = r.outcome;
  }

  return {
    runId: convo.runId,
    turns,
    steps: tracer.steps,
    finalAgent: convo.agent,
    outcome,
    effects: await effectsSince(deps.db, snapshot),
  };
}
