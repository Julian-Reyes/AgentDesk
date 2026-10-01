import type { OrderStatus, RefundReason } from "../db/schema.ts";
import { daysBetween } from "../domain/clock.ts";
import { RULES } from "./rules.ts";

/**
 * Goodwill is for problems the store or its carrier caused, never for
 * customer-side reasons (changed mind, wrong size, worn item, a missed return
 * window) or as a response to pushback. Julian's decision, 2026-10-01, after
 * dev-1: one model handed a 10% coupon to customers whose returns were denied.
 *
 * The labels are what the goodwill policy text says (seed/policies.ts), so the
 * text the agent reads and the rule the tool enforces come from one place.
 */
export const STORE_CAUSED_PROBLEMS = {
  lost: "the carrier lost the order",
  late: "the order is delayed",
  damaged: "an item arrived damaged",
} as const;
export type StoreCausedProblem = keyof typeof STORE_CAUSED_PROBLEMS;

export type GoodwillOrderState = {
  status: OrderStatus;
  /** Reasons of the order's refunds that were issued or are waiting for approval (not rejected ones). */
  refundReasons: RefundReason[];
};

/**
 * The store-caused problem on an order, from facts in the database, not from
 * what anyone says in chat:
 *  - status "lost" or "delayed"
 *  - or a lost, late or damaged refund already issued or pending on it. That's
 *    how damage is on record: a delivered order says nothing about its condition
 *    until a damaged-item refund is made. It also keeps a late order that has
 *    since been delivered (its late refund stays).
 * A "return" refund is the customer's own return, so it doesn't count.
 */
export function storeCausedProblem(order: GoodwillOrderState): StoreCausedProblem | null {
  if (order.status === "lost") return "lost";
  if (order.status === "delayed") return "late";
  for (const reason of ["damaged", "lost", "late"] as const) if (order.refundReasons.includes(reason)) return reason;
  return null;
}

export type GoodwillHistory = {
  /** When this customer last received a goodwill coupon, if ever. */
  lastIssuedAt: Date | null;
  /** A goodwill request already waiting for approval. */
  hasPending: boolean;
};

export type GoodwillDecision =
  | { decision: "auto_approved" }
  | { decision: "queued_for_approval"; why: string };

/**
 * Goodwill coupons are automatic only when all hold:
 *  - the coupon is for an order with a store-caused problem
 *  - up to 10%
 *  - at most one per customer per rolling 30 days, none already pending
 * Anything outside that isn't refused outright; a human decides.
 */
export function decideGoodwill(percent: number, problem: StoreCausedProblem | null, history: GoodwillHistory, now: Date): GoodwillDecision {
  if (percent > RULES.goodwillMaxPercent) {
    return {
      decision: "queued_for_approval",
      why: `${percent}% is above the ${RULES.goodwillMaxPercent}% automatic limit.`,
    };
  }
  if (problem === null) {
    return {
      decision: "queued_for_approval",
      why: "Goodwill is automatic only for a store-caused problem with an order (lost, delayed or damaged); this request names none.",
    };
  }
  if (history.hasPending) {
    return { decision: "queued_for_approval", why: "This customer already has a goodwill request awaiting approval." };
  }
  if (history.lastIssuedAt) {
    const days = daysBetween(history.lastIssuedAt, now);
    if (days < RULES.goodwillCooldownDays) {
      return {
        decision: "queued_for_approval",
        why: `This customer received a goodwill coupon ${days} days ago (limit: one per ${RULES.goodwillCooldownDays} days).`,
      };
    }
  }
  return { decision: "auto_approved" };
}
