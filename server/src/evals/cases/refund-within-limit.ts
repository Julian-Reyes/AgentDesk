import { defineCases } from "../case-schema.ts";

export const REFUND_WITHIN_LIMIT = defineCases([
  {
    id: "refund-within-limit-01",
    split: "dev",
    type: "refund_within_limit",
    why: "The Glowworm 300 on #1050 cost $29.00 and was delivered 5 days ago (within the 14-day damage window), so a $29.00 damaged-item refund is issued automatically. The damage is store-caused, so a goodwill coupon of 10% or less is allowed, not required (Julian, 2026-10-01, after dev-1): issued if the refund came first, queued if the coupon came first.",
    source: "spec table; timing claim from manual testing 2026-09-29",
    customer: "maya.chen@example.com",
    turns: [
      {
        customer: "The Glowworm headlamp from order #1050 arrived with a cracked lens and won't turn on.",
        reply: { amounts: [2900] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "approval_needed"],
      effects: {
        refunds: [{ order: 1050, amountCents: 2900, reason: "damaged", item: "lamp-glowworm-300", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1050, status: ["issued", "pending_approval"] }] },
        escalation: "forbidden",
      },
      judge: "Apologizes briefly, confirms the $29.00 refund to the original payment method. Doesn't invent when the money arrives (no tool says).",
    },
  },
  {
    id: "refund-within-limit-02",
    split: "dev",
    type: "refund_within_limit",
    why: "#1055 (Sofia) is delayed; a late delivery earns back the $7.99 shipping, automatically. A goodwill coupon is allowed on top (≤ 10%, queued since she got one 10 days ago), not required.",
    customer: "sofia.alvarez@example.com",
    turns: [{ customer: "My order #1055 is really late. Can I at least get my shipping cost back?", reply: { amounts: [799] } }],
    expect: {
      route: "support",
      outcome: ["resolved", "approval_needed"],
      effects: {
        refunds: [{ order: 1055, amountCents: 799, reason: "late", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1055, status: "pending_approval" }] },
        escalation: "forbidden",
      },
      judge: "Confirms the $7.99 shipping refund. If it requests a goodwill coupon, it says the coupon needs approval rather than implying it's issued.",
    },
  },
  {
    id: "refund-within-limit-03",
    split: "dev",
    type: "refund_within_limit",
    why: "#1074 (Rowan Brennan, delivered 11 days ago, within the 14-day damage window) has three items: a Voyager 80 pack, a Squall Rain Jacket and a Firefly Kids Headlamp ($14.99). The first message doesn't say which item is broken, so asking is the right move and the second message always fits. The Firefly cost $50 or less and the order has no other refunds, so $14.99 is refunded automatically. The damage is store-caused, so a goodwill coupon of 10% or less is allowed, not required (goodwill rule, 2026-10-01): issued if the refund came first, queued if the coupon came first.",
    source: "Julian's review, 2026-09-30 (replaces a single-item version where the follow-up might not fit)",
    customer: "rowan.brennan107@example.com",
    turns: [
      { customer: "Something from my order #1074 arrived broken. What can you do?" },
      {
        customer: "It's the kids' headlamp, the Firefly. It won't switch on at all, and the battery door is cracked.",
        assumes: "the agent asked which item is broken or what's wrong with it",
        reply: { amounts: [1499] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "approval_needed"],
      effects: {
        refunds: [{ order: 1074, amountCents: 1499, reason: "damaged", item: "lamp-firefly-kids", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1074, status: ["issued", "pending_approval"] }] },
        escalation: "forbidden",
      },
      judgeChecks: ["In its first reply, the agent asks which item is broken (or what's wrong) instead of guessing or refunding an item."],
    },
  },
  {
    id: "refund-within-limit-04",
    split: "dev",
    type: "refund_within_limit",
    why: "#1050 (Maya, Glowworm 300 Headlamp, $29.00, delivered 2026-09-10, inside the 14-day window): it never worked, from the day it arrived. Not working on delivery is 'arrived damaged' even with nothing visibly broken, so the damage-cause rule (Julian, 2026-10-05) must not block it: $29.00 is refunded automatically with cause arrived_damaged. The contrast to returns-06 (the same lamp failing after use). A goodwill coupon of 10% or less is allowed, not required, as in refund-within-limit-01.",
    source: "test-1 follow-up (2026-10-05): the real arrived-damaged case for the damage-cause rule",
    customer: "maya.chen@example.com",
    turns: [
      {
        customer: "The Glowworm headlamp from order #1050 never worked. I put new batteries in the day it arrived and it won't turn on at all.",
        reply: { amounts: [2900] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "approval_needed"],
      effects: {
        refunds: [{ order: 1050, amountCents: 2900, reason: "damaged", item: "lamp-glowworm-300", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1050, status: ["issued", "pending_approval"] }] },
        escalation: "forbidden",
      },
      judgeChecks: ["The agent treats an item that never worked from delivery as arrived damaged and refunds it, rather than calling it used or a warranty claim."],
    },
  },
]);
