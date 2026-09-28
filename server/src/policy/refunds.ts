import type { OrderStatus } from "../db/schema.ts";
import { daysBetween } from "../domain/clock.ts";
import { formatCents, type Cents } from "../domain/money.ts";
import { RULES } from "./rules.ts";

/** Reasons an agent may refund for. Returns are refunded by the warehouse on receipt, not in chat. */
export const AGENT_REFUND_REASONS = ["damaged", "lost", "late"] as const;
export type AgentRefundReason = (typeof AGENT_REFUND_REASONS)[number];

export type RefundOrderState = {
  status: OrderStatus;
  deliveredAt: Date | null;
  shippingCents: Cents;
  totalPaidCents: Cents;
  /** Sum of refunds already issued on this order. */
  issuedCents: Cents;
  /** Sum of refunds waiting in the approvals queue. */
  pendingCents: Cents;
};

export type RefundDecision =
  | { decision: "auto_approved"; amountCents: Cents }
  | { decision: "queued_for_approval"; amountCents: Cents; why: string }
  | { decision: "denied"; code: string; message: string; details?: Record<string, unknown> };

/**
 * The refund rules, in order:
 *  1. the reason must match the order's actual state
 *  2. the amount can never exceed what's still refundable (paid − issued − pending),
 *     and a "late" refund covers shipping only
 *  3. automatic only while the order's refunds in total (issued + pending + this one)
 *     stay at or under $50. Counting the total stops a $180 refund from being
 *     split into four $45 ones.
 *  4. otherwise it goes to the approvals queue
 */
export function decideRefund(
  order: RefundOrderState,
  reason: AgentRefundReason,
  amountCents: Cents,
  now: Date,
): RefundDecision {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return deny("INVALID_AMOUNT", "Refund amount must be a positive number of cents.");
  }

  let cap = order.totalPaidCents - order.issuedCents - order.pendingCents;

  switch (reason) {
    case "damaged": {
      if (order.status !== "delivered" || !order.deliveredAt) {
        return deny("REASON_DOES_NOT_MATCH_ORDER", "A damaged-item refund needs a delivered order.");
      }
      const days = daysBetween(order.deliveredAt, now);
      if (days > RULES.damageReportWindowDays) {
        return deny(
          "DAMAGE_REPORT_WINDOW_EXPIRED",
          `Damage must be reported within ${RULES.damageReportWindowDays} days of delivery; this order was delivered ${days} days ago. Escalate if the customer disputes this.`,
          { daysSinceDelivery: days },
        );
      }
      break;
    }
    case "lost":
      if (order.status !== "lost") {
        return deny("REASON_DOES_NOT_MATCH_ORDER", `The order's status is "${order.status}", not lost.`);
      }
      break;
    case "late":
      if (order.status !== "delayed") {
        return deny("REASON_DOES_NOT_MATCH_ORDER", `The order's status is "${order.status}", not delayed.`);
      }
      // A late delivery earns back the shipping cost, nothing more.
      cap = Math.min(cap, order.shippingCents - order.issuedCents - order.pendingCents);
      break;
  }

  if (cap <= 0) {
    return deny("NOTHING_REFUNDABLE", "There is nothing left to refund on this order.", {
      totalPaid: formatCents(order.totalPaidCents),
      alreadyRefunded: formatCents(order.issuedCents),
      pending: formatCents(order.pendingCents),
    });
  }
  if (amountCents > cap) {
    return deny(
      "AMOUNT_EXCEEDS_REFUNDABLE",
      `The most that can be refunded for this is ${formatCents(cap)}.`,
      { maxRefundable: formatCents(cap), maxRefundableCents: cap },
    );
  }

  const orderTotalAfter = order.issuedCents + order.pendingCents + amountCents;
  if (orderTotalAfter <= RULES.autoRefundLimitCents) {
    return { decision: "auto_approved", amountCents };
  }
  return {
    decision: "queued_for_approval",
    amountCents,
    why: `Refunds on this order would total ${formatCents(orderTotalAfter)}, above the ${formatCents(RULES.autoRefundLimitCents)} automatic limit.`,
  };
}

function deny(code: string, message: string, details?: Record<string, unknown>): RefundDecision {
  return details ? { decision: "denied", code, message, details } : { decision: "denied", code, message };
}
