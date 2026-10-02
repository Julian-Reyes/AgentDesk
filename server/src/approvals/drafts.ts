import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { formatCents } from "../domain/money.ts";

/**
 * "Rejections become new test cases": a human rejecting what an agent queued
 * is a judgement the evals don't capture yet. For each rejected approval that
 * came from a conversation, this writes a DRAFT case: the customer, their
 * messages replayed from the trace, and the rejection note as the `why`.
 *
 * Drafts are deliberately not valid cases. The expectations are TODO and the
 * folder isn't imported by cases/index.ts, so nothing runs until Julian
 * reviews a draft, fills it in and moves it into a case file (where
 * defineCases validates it). A CLI writes them, not the dashboard: cases are
 * code reviewed in the repo, and a deployed dashboard can't write repo files.
 */
export const DRAFTS_DIR = fileURLToPath(new URL("../evals/cases/drafts", import.meta.url));

export type RejectedApproval = {
  approval: typeof s.approvals.$inferSelect & { runId: string };
  customerEmail: string;
};

/** Named by run and approval: approval ids restart after `db:seed`, run ids don't. */
export const draftFileName = (a: { id: number; runId: string }) => `rejection-${a.runId.slice(0, 8)}-${a.id}.ts`;

export const draftExists = (dir: string, a: { id: number; runId: string | null }) =>
  a.runId !== null && existsSync(join(dir, draftFileName({ id: a.id, runId: a.runId })));

export async function rejectedWithRun(db: DbOrTx): Promise<RejectedApproval[]> {
  const rows = await db
    .select({ approval: s.approvals, customerEmail: s.customers.email })
    .from(s.approvals)
    .innerJoin(s.customers, eq(s.customers.id, s.approvals.customerId))
    .where(and(eq(s.approvals.status, "rejected"), isNotNull(s.approvals.runId)))
    .orderBy(desc(s.approvals.id));
  return rows.map((r) => ({ ...r, approval: { ...r.approval, runId: r.approval.runId! } }));
}

/** The customer's messages in the conversation, in order (from the trace's user_message steps). */
export async function customerMessages(db: DbOrTx, runId: string): Promise<string[]> {
  const steps = await db
    .select({ data: s.runSteps.data })
    .from(s.runSteps)
    .where(and(eq(s.runSteps.runId, runId), eq(s.runSteps.kind, "user_message")))
    .orderBy(asc(s.runSteps.seq));
  return steps.map((st) => String(st.data.text ?? ""));
}

function describeRequest(a: typeof s.approvals.$inferSelect): string {
  const p = a.payload;
  const order = a.orderNumber ? ` on #${a.orderNumber}` : "";
  if (a.kind === "refund") {
    const item = typeof p.item === "string" ? ` (${p.item})` : "";
    return `a ${formatCents(Number(p.amountCents))} ${String(p.reason)} refund${order}${item}`;
  }
  return `a ${String(p.percent)}% goodwill coupon${order}`;
}

/** The draft file's source. Strings go through JSON.stringify, so quotes and newlines in messages can't break it. */
export function renderDraft({ approval: a, customerEmail }: RejectedApproval, messages: string[]): string {
  const q = JSON.stringify;
  const decided = a.decidedAt ? a.decidedAt.toISOString().slice(0, 10) : "unknown date";
  const why = `TODO: rewrite. ${a.decidedBy ?? "A human"} rejected ${describeRequest(a)} on ${decided}: "${a.decisionNote ?? ""}". The agent queued it because: ${a.reason}`;
  const turns = messages.length ? messages : ["TODO: no customer messages found in the trace"];
  return `// DRAFT eval case from rejected approval #${a.id} (conversation ${a.runId}).
// Written by \`npm run eval:draft-from-rejections\`. Not in ALL_CASES, so it never runs as is.
// To use it: fill in the TODOs, check the script still makes sense, and move it into a case file.

export const draft = {
  id: ${q(`TODO-rejection-${a.runId.slice(0, 8)}-${a.id}`)},
  split: "TODO: dev or test",
  type: "TODO",
  why: ${q(why)},
  source: ${q(`rejected approval #${a.id}, run ${a.runId}`)},
  customer: ${q(customerEmail)},
  turns: [
${turns.map((m, i) => `    { customer: ${q(m)}${i > 0 ? `, assumes: "TODO: what this message assumes the previous reply did"` : ""} },`).join("\n")}
  ],
  expect: "TODO: what should have happened instead (route, outcome, effects). The rejection note says why the queued request was wrong.",
};
`;
}
