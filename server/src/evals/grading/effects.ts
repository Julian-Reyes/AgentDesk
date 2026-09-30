import { and, eq, gt, sql } from "drizzle-orm";
import type { DbOrTx } from "../../db/client.ts";
import * as s from "../../db/schema.ts";

/**
 * What a conversation changed in the store: refunds, goodwill coupons and
 * escalation tickets. Read from the database (the source of truth), not from
 * what the model said it did.
 *
 * Usage: snapshotStore() before the conversation, effectsSince() after it,
 * inside the same transaction (eval runs roll it back afterwards).
 */

export type ObservedRefund = {
  order: number;
  amountCents: number;
  reason: string;
  status: "issued" | "pending_approval";
  /** Product id of the damaged item, or null for order-level refunds. */
  item: string | null;
};
export type ObservedGoodwill = { percent: number; status: "issued" | "pending_approval" };
export type ObservedEffects = { refunds: ObservedRefund[]; goodwill: ObservedGoodwill[]; escalations: number };

export type StoreSnapshot = { refundId: number; approvalId: number; escalationId: number; goodwillCodes: Set<string> };

const maxId = async (db: DbOrTx, table: typeof s.refunds | typeof s.approvals | typeof s.escalations) => {
  const [row] = await db.select({ max: sql<number>`coalesce(max(${table.id}), 0)::int` }).from(table);
  return row!.max;
};

export async function snapshotStore(db: DbOrTx): Promise<StoreSnapshot> {
  const codes = await db.select({ code: s.coupons.code }).from(s.coupons).where(eq(s.coupons.source, "goodwill"));
  return {
    refundId: await maxId(db, s.refunds),
    approvalId: await maxId(db, s.approvals),
    escalationId: await maxId(db, s.escalations),
    goodwillCodes: new Set(codes.map((c) => c.code)),
  };
}

export async function effectsSince(db: DbOrTx, snap: StoreSnapshot): Promise<ObservedEffects> {
  const refundRows = await db
    .select({ refund: s.refunds, productId: s.orderItems.productId })
    .from(s.refunds)
    .leftJoin(s.orderItems, eq(s.orderItems.id, s.refunds.orderItemId))
    .where(gt(s.refunds.id, snap.refundId))
    .orderBy(s.refunds.id);

  const issuedCoupons = await db
    .select({ code: s.coupons.code, value: s.coupons.value })
    .from(s.coupons)
    .where(eq(s.coupons.source, "goodwill"));
  const queuedCoupons = await db
    .select({ payload: s.approvals.payload })
    .from(s.approvals)
    .where(and(gt(s.approvals.id, snap.approvalId), eq(s.approvals.kind, "goodwill_coupon")))
    .orderBy(s.approvals.id);

  const [esc] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.escalations)
    .where(gt(s.escalations.id, snap.escalationId));

  return {
    refunds: refundRows.map(({ refund, productId }) => ({
      order: refund.orderNumber,
      amountCents: refund.amountCents,
      reason: refund.reason,
      status: refund.status as ObservedRefund["status"],
      item: productId,
    })),
    goodwill: [
      ...issuedCoupons.filter((c) => !snap.goodwillCodes.has(c.code)).map((c) => ({ percent: c.value, status: "issued" as const })),
      ...queuedCoupons.map((a) => ({ percent: Number(a.payload.percent), status: "pending_approval" as const })),
    ],
    escalations: esc!.n,
  };
}
