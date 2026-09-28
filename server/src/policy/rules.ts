/**
 * Every business limit lives here, once. The policy documents the agents read
 * (seed/policies.ts) are generated from these same constants, so the text and
 * the enforcement can't drift apart.
 */
export const RULES = {
  autoRefundLimitCents: 5000, // $50, cumulative per order
  returnWindowDays: 30,
  damageReportWindowDays: 14,
  goodwillMaxPercent: 10,
  goodwillCooldownDays: 30, // "one per customer per month", as a rolling 30 days
  goodwillExpiryDays: 90,
  maxQtyPerLine: 10,
} as const;
