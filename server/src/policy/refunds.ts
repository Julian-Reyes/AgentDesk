import type { OrderStatus } from "../db/schema.ts";
import { calendarDaysBetween } from "../domain/clock.ts";
import { formatCents, type Cents } from "../domain/money.ts";
import { RULES } from "./rules.ts";

/** Reasons an agent may refund for. Returns are refunded by the warehouse on receipt, not in chat. */
export const AGENT_REFUND_REASONS = ["damaged", "lost", "late"] as const;
export type AgentRefundReason = (typeof AGENT_REFUND_REASONS)[number];

/**
 * When the damage happened. Only damage the item arrived with is the store's
 * problem. Damage after delivery (a drop, an accident, a failure after use) is
 * the warranty's question, or nobody's. The tools ask for this explicitly
 * because, with only the word "damaged" to choose from, agents refunded a
 * dropped headlamp and one that stopped charging after a trip (test-1, 2026-10-05).
 */
export const DAMAGE_CAUSES = ["arrived_damaged", "damaged_after_delivery"] as const;
export type DamageCause = (typeof DAMAGE_CAUSES)[number];

/** Shared by issue_refund and check_return_eligibility, so both tools say the same thing. */
export const DAMAGED_AFTER_DELIVERY_MESSAGE =
  "Damage that happened after delivery (the item was dropped, had an accident, or broke or stopped working after use) isn't refunded as a damaged item and can't be returned. If it's a manufacturing defect that showed up in normal use, the 1-year warranty may cover it; warranty claims are handled by a team member. Accidental damage, misuse and normal wear aren't covered.";

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

/** The damaged item a refund is for. Damaged-item refunds are decided per item. */
export type RefundItem = {
  name: string;
  /** What the customer paid for the whole line, after sales. */
  paidCents: Cents;
  /** Units on the line. The $50 automatic limit is judged on one unit's price (paidCents / qty). */
  qty: number;
  /** What's still refundable for this item: paid for units not returned, minus refunds already issued or pending for it. */
  refundableCents: Cents;
};

export type RefundDecision =
  | { decision: "auto_approved"; amountCents: Cents }
  | { decision: "queued_for_approval"; amountCents: Cents; why: string }
  | { decision: "denied"; code: string; message: string; details?: Record<string, unknown> };

/**
 * The refund rules, in order:
 *  1. the reason must match the order's actual state; a "damaged" refund also
 *     needs the cause, and only "arrived_damaged" is refunded
 *  2. the amount can never exceed what's still refundable (paid − issued − pending),
 *     and a "late" refund covers shipping only
 *     and a "damaged" refund covers the named item only
 *  3. automatic only if
 *     - the order's refunds in total (issued + pending + this one) stay at or
 *       under $50, which stops a big refund being split into small ones, and
 *     - for "damaged", one unit of the item cost $50 or less. So a $179.99 item
 *       always goes to approval, even when the agent asks for "just $50 now" (found
 *       on 2026-09-29: an agent split a $179.99 claim into an automatic $50 plus an
 *       escalation, bypassing the approvals queue). A pair of $49 headlamps on one
 *       line counts as $49 items (Julian, 2026-10-02); refunding both still goes to
 *       approval through the $50 order total.
 *  4. otherwise it goes to the approvals queue
 */
export function decideRefund(
  order: RefundOrderState,
  reason: AgentRefundReason,
  amountCents: Cents,
  now: Date,
  item?: RefundItem,
  damageCause?: DamageCause,
): RefundDecision {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return deny("INVALID_AMOUNT", "Refund amount must be a positive number of cents.");
  }

  switch (reason) {
    case "damaged": {
      if (order.status !== "delivered" || !order.deliveredAt) {
        return deny("REASON_DOES_NOT_MATCH_ORDER", "A damaged-item refund needs a delivered order.");
      }
      if (!damageCause) {
        return deny(
          "DAMAGE_CAUSE_REQUIRED",
          'A damaged-item refund needs the cause: "arrived_damaged" (damaged or not working when it was delivered) or "damaged_after_delivery" (dropped, broken, or stopped working after it arrived).',
        );
      }
      if (damageCause === "damaged_after_delivery") {
        return deny("DAMAGED_AFTER_DELIVERY", DAMAGED_AFTER_DELIVERY_MESSAGE);
      }
      const days = calendarDaysBetween(order.deliveredAt, now);
      if (days > RULES.damageReportWindowDays) {
        return deny(
          "DAMAGE_REPORT_WINDOW_EXPIRED",
          `Damage must be reported within ${RULES.damageReportWindowDays} days of delivery; this order was delivered ${days} days ago. Escalate if the customer disputes this.`,
          { daysSinceDelivery: days },
        );
      }
      if (!item) {
        return deny("ITEM_REQUIRED", "A damaged-item refund must name the damaged item from the order.");
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
      break;
  }

  const cap = refundCapCents(order, reason, item);
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

  // paid / qty > limit, without dividing (a line's discount needn't split evenly into cents).
  if (reason === "damaged" && item && item.paidCents > RULES.autoRefundLimitCents * item.qty) {
    const each = item.qty > 1 ? " each" : "";
    return {
      decision: "queued_for_approval",
      amountCents,
      why: `The damaged item (${item.name}) cost ${formatCents(Math.round(item.paidCents / item.qty))}${each}, above the ${formatCents(RULES.autoRefundLimitCents)} automatic limit.`,
    };
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

/**
 * Rule 2 on its own: the most that can still be refunded for this reason,
 * given what's already issued or pending. Also used when a human approves a
 * queued refund (approvals/decide.ts), so nobody can approve above what was
 * paid either.
 */
export function refundCapCents(
  order: Pick<RefundOrderState, "totalPaidCents" | "shippingCents" | "issuedCents" | "pendingCents">,
  reason: AgentRefundReason,
  item?: Pick<RefundItem, "refundableCents">,
): Cents {
  let cap = order.totalPaidCents - order.issuedCents - order.pendingCents;
  // A damaged-item refund covers that item only.
  if (reason === "damaged" && item) cap = Math.min(cap, item.refundableCents);
  // A late delivery earns back the shipping cost, nothing more.
  if (reason === "late") cap = Math.min(cap, order.shippingCents - order.issuedCents - order.pendingCents);
  return cap;
}

function deny(code: string, message: string, details?: Record<string, unknown>): RefundDecision {
  return details ? { decision: "denied", code, message, details } : { decision: "denied", code, message };
}
