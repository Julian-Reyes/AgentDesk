import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { addDays } from "../domain/clock.ts";
import { formatCents } from "../domain/money.ts";
import { AGENT_REFUND_REASONS, refundCapCents } from "../policy/refunds.ts";
import { RULES } from "../policy/rules.ts";
import { itemRefundableCents, orderRefundSums } from "../tools/common.ts";
import { fail, ok, type ToolResult } from "../tools/define.ts";

/**
 * A human's decision on something the agents queued (the ops dashboard's
 * Approvals page). The human may approve what the automatic rules wouldn't (a
 * $179.99 refund, a 20% coupon), but never a refund above what the customer
 * paid: that is re-checked here, at decision time, with the same rule the
 * refund tool uses (policy/refunds.ts refundCapCents).
 *
 * Each decision is one transaction. The approval row is locked first, so two
 * admins clicking at once can't both decide it; then the order row, the same
 * lock issue_refund takes, so a refund can't race a new one on that order.
 */
export type DecisionContext = {
  db: DbOrTx;
  /** The store's "today": coupon dates are store dates, like everything the tools see. */
  storeNow: Date;
  /** Wall-clock time of the decision. */
  decidedAt: Date;
  /** Who decided ("admin" with M4's shared token; the logged-in user from M5). */
  decidedBy: string;
};

export const NOTE_MIN_LENGTH = 3;
export const NOTE_MAX_LENGTH = 1000;

/** A rejection must say why: the note becomes the `why` of a draft eval case. */
export function checkNote(note: string | undefined, required: boolean): ToolResult<string | null> {
  const text = note?.trim() ?? "";
  if (text.length > NOTE_MAX_LENGTH) return fail("NOTE_TOO_LONG", `The note can be at most ${NOTE_MAX_LENGTH} characters.`);
  if (required && text.length < NOTE_MIN_LENGTH) return fail("NOTE_REQUIRED", "Rejecting needs a short note saying why.");
  return ok(text || null);
}

const GoodwillPayload = z.object({ percent: z.number().int().positive() });

export const goodwillCode = (approvalId: number) => `GOODWILL-${approvalId}`;

export async function approve(ctx: DecisionContext, approvalId: number, note?: string): Promise<ToolResult> {
  const checked = checkNote(note, false);
  if (!checked.ok) return checked;
  return ctx.db.transaction(async (tx) => {
    const approval = await lockPending(tx, approvalId);
    if (!approval.ok) return approval;
    const a = approval.data;

    if (a.kind === "refund") {
      const [refund] = await tx.select().from(s.refunds).where(eq(s.refunds.approvalId, a.id));
      // issue_refund always writes both rows together; one without the other is a bug, not a business outcome.
      if (!refund || refund.status !== "pending_approval") throw new Error(`Approval #${a.id} has no pending refund row.`);
      await tx.execute(sql`select 1 from ${s.orders} where ${s.orders.number} = ${refund.orderNumber} for update`);
      const [order] = await tx.select().from(s.orders).where(eq(s.orders.number, refund.orderNumber));

      // Everything else on the order (and on the item) counts; this refund itself doesn't.
      const sums = await orderRefundSums(tx, refund.orderNumber, refund.id);
      let refundableCents: number | undefined;
      if (refund.orderItemId !== null) {
        const [line] = await tx.select().from(s.orderItems).where(eq(s.orderItems.id, refund.orderItemId));
        refundableCents = await itemRefundableCents(tx, line!, refund.id);
      }
      const reason = z.enum(AGENT_REFUND_REASONS).parse(refund.reason);
      const cap = refundCapCents(
        { totalPaidCents: order!.totalPaidCents, shippingCents: order!.shippingCents, issuedCents: sums.issued, pendingCents: sums.pending },
        reason,
        refundableCents === undefined ? undefined : { refundableCents },
      );
      if (refund.amountCents > cap) {
        return fail(
          "OVER_REFUNDABLE",
          `Can't approve ${formatCents(refund.amountCents)}: at most ${formatCents(Math.max(cap, 0))} is still refundable for this. Reject it instead.`,
          { amountCents: refund.amountCents, maxRefundableCents: Math.max(cap, 0) },
        );
      }
      await tx.update(s.refunds).set({ status: "issued" }).where(eq(s.refunds.id, refund.id));
      await markDecided(tx, ctx, a.id, "approved", checked.data);
      return ok({ id: a.id, status: "approved", refundId: refund.id, amountCents: refund.amountCents });
    }

    // Goodwill: the coupon is created now, exactly as requested. The percent
    // and the monthly limit were the reasons it was queued; the human decided.
    const { percent } = GoodwillPayload.parse(a.payload);
    await tx.execute(sql`select 1 from ${s.customers} where ${s.customers.id} = ${a.customerId} for update`);
    const code = goodwillCode(a.id);
    const expiresAt = addDays(ctx.storeNow, RULES.goodwillExpiryDays);
    await tx.insert(s.coupons).values({
      code,
      kind: "percent",
      value: percent,
      singleUse: true,
      source: "goodwill",
      customerId: a.customerId,
      createdAt: ctx.storeNow,
      expiresAt,
    });
    await markDecided(tx, ctx, a.id, "approved", checked.data);
    return ok({ id: a.id, status: "approved", code, percent, expiresAt: expiresAt.toISOString().slice(0, 10) });
  });
}

export async function reject(ctx: DecisionContext, approvalId: number, note: string | undefined): Promise<ToolResult> {
  const checked = checkNote(note, true);
  if (!checked.ok) return checked;
  return ctx.db.transaction(async (tx) => {
    const approval = await lockPending(tx, approvalId);
    if (!approval.ok) return approval;
    // Nothing is issued; a queued refund is marked rejected so it no longer counts as pending.
    await tx.update(s.refunds).set({ status: "rejected" }).where(eq(s.refunds.approvalId, approvalId));
    await markDecided(tx, ctx, approvalId, "rejected", checked.data);
    return ok({ id: approvalId, status: "rejected" });
  });
}

async function lockPending(tx: DbOrTx, approvalId: number): Promise<ToolResult<typeof s.approvals.$inferSelect>> {
  const [a] = await tx.select().from(s.approvals).where(eq(s.approvals.id, approvalId)).for("update");
  if (!a) return fail("NOT_FOUND", `No approval #${approvalId}.`);
  if (a.status !== "pending") {
    return fail("ALREADY_DECIDED", `Approval #${approvalId} was already ${a.status}${a.decidedBy ? ` by ${a.decidedBy}` : ""}.`);
  }
  return ok(a);
}

function markDecided(tx: DbOrTx, ctx: DecisionContext, id: number, status: "approved" | "rejected", note: string | null) {
  return tx
    .update(s.approvals)
    .set({ status, decidedBy: ctx.decidedBy, decidedAt: ctx.decidedAt, decisionNote: note })
    .where(eq(s.approvals.id, id));
}
