import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import * as s from "../db/schema.ts";

/**
 * Tracing: every conversation is a run, every event in it a step. The loop
 * only talks to this interface; tests use the in-memory tracer, real runs the
 * Postgres one.
 *
 * The DB tracer takes its own connection, never the tools' transaction. Eval
 * runs execute tools inside a transaction that is rolled back afterwards, and
 * the trace must survive that rollback.
 */

export type RunOutcome = (typeof s.RUN_OUTCOMES)[number];

/** reply_rejected: a garbled reply held back before the customer saw it (agents/reply-check.ts). */
export type StepKind = "user_message" | "router" | "model_call" | "tool_call" | "handoff" | "reply" | "reply_rejected" | "error";

export type StepRecord = {
  turn: number;
  kind: StepKind;
  agent?: string;
  modelConfigId?: string;
  provider?: string;
  promptVersion?: string;
  data: Record<string, unknown>;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  cached?: boolean;
  policyDecision?: string;
  costMicros?: number;
};

export type RunMeta = {
  source: string;
  customerId: number | null;
  team: Record<string, unknown>;
  labels?: Record<string, unknown>;
};

export type RunSummary = { outcome: RunOutcome; turns: number };

export interface RunTrace {
  readonly id: string;
  step(step: StepRecord): Promise<void>;
  finish(summary: RunSummary): Promise<void>;
}

export interface Tracer {
  startRun(meta: RunMeta): Promise<RunTrace>;
}

/** Keeps everything in memory. Used by tests, and handy for inspecting a run in a script. */
export class MemoryTracer implements Tracer {
  readonly runs: Array<RunMeta & { id: string; steps: (StepRecord & { seq: number })[]; summary?: RunSummary }> = [];

  async startRun(meta: RunMeta): Promise<RunTrace> {
    const run = { ...meta, id: `run_${this.runs.length + 1}`, steps: [] as (StepRecord & { seq: number })[], summary: undefined as RunSummary | undefined };
    this.runs.push(run);
    return {
      id: run.id,
      step: async (step) => void run.steps.push({ ...step, seq: run.steps.length + 1 }),
      finish: async (summary) => void (run.summary = summary),
    };
  }
}

/** Writes runs and steps to Postgres. `now` is wall-clock time (when the event happened), injectable for tests. */
export class DbTracer implements Tracer {
  private readonly db: Db;
  private readonly now: () => Date;
  constructor(db: Db, now: () => Date = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  async startRun(meta: RunMeta): Promise<RunTrace> {
    const id = randomUUID();
    const { db, now } = this;
    await db.insert(s.runs).values({
      id,
      source: meta.source,
      customerId: meta.customerId,
      team: meta.team,
      labels: meta.labels ?? {},
      startedAt: now(),
    });
    let seq = 0;
    return {
      id,
      async step(step) {
        seq += 1;
        await db.insert(s.runSteps).values({
          runId: id,
          seq,
          turn: step.turn,
          kind: step.kind,
          agent: step.agent ?? null,
          modelConfigId: step.modelConfigId ?? null,
          provider: step.provider ?? null,
          promptVersion: step.promptVersion ?? null,
          data: step.data,
          inputTokens: step.inputTokens ?? null,
          outputTokens: step.outputTokens ?? null,
          latencyMs: step.latencyMs ?? null,
          cached: step.cached ?? null,
          policyDecision: step.policyDecision ?? null,
          createdAt: now(),
        });
        if (step.inputTokens || step.outputTokens || step.costMicros) {
          // Keep run totals current as we go, so a crashed run still shows what it used.
          await db
            .update(s.runs)
            .set({
              inputTokens: sql`${s.runs.inputTokens} + ${step.inputTokens ?? 0}`,
              outputTokens: sql`${s.runs.outputTokens} + ${step.outputTokens ?? 0}`,
              costMicros: sql`${s.runs.costMicros} + ${step.costMicros ?? 0}`,
            })
            .where(eq(s.runs.id, id));
        }
      },
      async finish({ outcome, turns }) {
        await db.update(s.runs).set({ outcome, turns, endedAt: now() }).where(eq(s.runs.id, id));
      },
    };
  }
}
