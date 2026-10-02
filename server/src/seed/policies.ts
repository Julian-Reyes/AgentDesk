import type { PolicyTopic } from "../db/schema.ts";
import { formatCents } from "../domain/money.ts";
import { STORE_CAUSED_PROBLEMS } from "../policy/goodwill.ts";
import { RULES } from "../policy/rules.ts";
import { SHIPPING } from "./promotions.ts";

/**
 * The policy documents agents read via get_policy. Numbers are interpolated
 * from RULES and SHIPPING (the same constants the code enforces), so the text
 * can never promise something the code doesn't do.
 */
export const POLICY_DOCS: { topic: PolicyTopic; title: string; body: string }[] = [
  {
    topic: "shipping",
    title: "Shipping",
    body: [
      `Standard shipping costs ${formatCents(SHIPPING.flatRateCents)} and is free on orders of ${formatCents(SHIPPING.thresholdCents)} or more (after discounts).`,
      "Orders ship from our warehouse within 1–2 business days and arrive 3–6 business days after shipping.",
      "We ship within the United States only.",
      "Tracking is available once an order has shipped.",
      "If an order is delayed, we refund the shipping cost on request.",
    ].join("\n"),
  },
  {
    topic: "returns",
    title: "Returns",
    body: [
      `Unused items in original packaging can be returned within ${RULES.returnWindowDays} days of delivery.`,
      "Used or worn items can't be returned. If a used item is defective, see the warranty policy.",
      "To return an item, send it back using the return label from your account. The refund is issued to your original payment method once the warehouse receives it, usually within 5 business days.",
      "Items that arrived damaged follow the damaged-items policy instead.",
    ].join("\n"),
  },
  {
    topic: "refunds",
    title: "Refunds",
    body: [
      "Refunds go back to the original payment method.",
      "A refund can never be more than what was paid for the order.",
      `Our support team can issue refunds for damaged items, lost orders and late deliveries (shipping cost only). Refunds up to ${formatCents(RULES.autoRefundLimitCents)} per order are processed right away; larger amounts are reviewed by a team member, usually within one business day.`,
      `Damaged items are refunded per item, up to what was paid for that item. An item that cost more than ${formatCents(RULES.autoRefundLimitCents)} (per unit) is always reviewed by a team member, whatever amount is requested.`,
      "Refunds for returned items are issued when the warehouse receives the return.",
    ].join("\n"),
  },
  {
    topic: "warranty",
    title: "Warranty",
    body: [
      "Larchgrove Supply Co. products carry a 1-year warranty against manufacturing defects (seams, zippers, buckles, poles, electronics).",
      "The warranty doesn't cover normal wear, misuse, or accidental damage.",
      "Warranty claims are handled by a team member: we repair, replace, or refund at our discretion.",
    ].join("\n"),
  },
  {
    topic: "price_match",
    title: "Price matching",
    body: [
      "We don't offer price matching, including with other retailers or marketplaces.",
      "Current sales and valid coupon codes are the ways to save.",
    ].join("\n"),
  },
  {
    topic: "damaged_items",
    title: "Damaged items",
    body: [
      `If an item arrives damaged, report it within ${RULES.damageReportWindowDays} days of delivery.`,
      "We'll refund the item or send a replacement; you don't need to send the damaged item back unless we ask.",
      `A damaged item that cost ${formatCents(RULES.autoRefundLimitCents)} or less per unit is refunded right away, as long as the order's refunds stay within ${formatCents(RULES.autoRefundLimitCents)} in total; pricier items and larger totals are reviewed by a team member, usually within one business day.`,
      `Reports after ${RULES.damageReportWindowDays} days are reviewed case by case by a team member.`,
    ].join("\n"),
  },
  {
    topic: "promotions",
    title: "Sales, deals and coupons",
    body: [
      "Prices are calculated in this order: category sales first, then buy-2-get-1 deals, then a coupon code, then shipping.",
      "Buy 2, get 1 free: in every group of three qualifying items, the lowest-priced one is free.",
      "Only one coupon code can be used per order. Coupons may have a minimum spend, an expiry date, or excluded categories; the minimum spend counts eligible items only, after sales.",
      "Expired, used, or invalid codes can't be applied.",
      "Prices include tax.",
    ].join("\n"),
  },
  {
    topic: "goodwill",
    title: "Goodwill coupons",
    body: [
      `A goodwill coupon is a percent-off coupon for a future order, offered as an apology when we or our carrier caused a problem with an order: ${Object.values(STORE_CAUSED_PROBLEMS).join(", ")}.`,
      "Problems on the customer's side (a change of mind, the wrong size, a used item, a missed return window) don't qualify, and neither does disagreeing with a policy decision.",
      `Coupons for one of those problems, up to ${RULES.goodwillMaxPercent}% and at most one per customer every ${RULES.goodwillCooldownDays} days, are issued right away. Anything else (a higher percentage, a second coupon within ${RULES.goodwillCooldownDays} days, or no store-caused problem) is reviewed by a team member.`,
      `Goodwill coupons are single use, only for the customer's own account, and expire after ${RULES.goodwillExpiryDays} days.`,
    ].join("\n"),
  },
];
