import { asc, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";

export const APPROVAL_STATUSES = s.approvalStatusEnum.enumValues;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/**
 * One row of the Approvals page. Only the customer's name goes to the browser
 * (the dashboard is public and read-only, like the chat personas: no emails).
 */
export type ApprovalView = {
  id: number;
  kind: "refund" | "goodwill_coupon";
  status: ApprovalStatus;
  customer: { id: number; name: string };
  orderNumber: number | null;
  /** Refunds: the amount; goodwill: the percent. */
  amountCents: number | null;
  percent: number | null;
  /** The damaged item, for item refunds. */
  item: string | null;
  refundReason: string | null;
  /** What the agent wrote with the request (refund note, or the goodwill reason). */
  agentNote: string | null;
  /** Why the rules queued it instead of doing it automatically. */
  queuedBecause: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** The conversation that queued it (link to its trace), when it came from one. */
  runId: string | null;
};

const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);

/** Pending oldest first (a queue); decided newest first (history). */
export async function listApprovals(db: DbOrTx, status?: ApprovalStatus): Promise<ApprovalView[]> {
  const rows = await db
    .select({ a: s.approvals, name: s.customers.name })
    .from(s.approvals)
    .innerJoin(s.customers, eq(s.customers.id, s.approvals.customerId))
    .where(status ? eq(s.approvals.status, status) : undefined)
    .orderBy(status === "pending" ? asc(s.approvals.id) : desc(s.approvals.id));
  return rows.map(({ a, name }) => {
    const p = a.payload;
    const refund = a.kind === "refund";
    return {
      id: a.id,
      kind: a.kind,
      status: a.status,
      customer: { id: a.customerId, name },
      orderNumber: a.orderNumber,
      amountCents: refund ? num(p.amountCents) : null,
      percent: refund ? null : num(p.percent),
      item: refund ? str(p.item) : null,
      refundReason: refund ? str(p.reason) : null,
      agentNote: refund ? str(p.note) : str(p.reason),
      queuedBecause: a.reason,
      createdAt: a.createdAt.toISOString(),
      decidedBy: a.decidedBy,
      decidedAt: a.decidedAt?.toISOString() ?? null,
      decisionNote: a.decisionNote,
      runId: a.runId,
    };
  });
}
