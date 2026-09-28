import { daysBetween } from "../domain/clock.ts";
import { RULES } from "./rules.ts";

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
 * Goodwill coupons: up to 10%, at most one per customer per rolling 30 days.
 * Anything outside that isn't refused outright; a human decides.
 */
export function decideGoodwill(percent: number, history: GoodwillHistory, now: Date): GoodwillDecision {
  if (percent > RULES.goodwillMaxPercent) {
    return {
      decision: "queued_for_approval",
      why: `${percent}% is above the ${RULES.goodwillMaxPercent}% automatic limit.`,
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
