import { defineCases } from "../case-schema.ts";

export const REFUND_WITHIN_LIMIT = defineCases([
  {
    id: "refund-within-limit-01",
    split: "dev",
    type: "refund_within_limit",
    why: "The Glowworm 300 on #1050 cost $29.00 and was delivered 5 days ago (within the 14-day damage window), so a $29.00 damaged-item refund is issued automatically.",
    source: "spec table; timing claim from manual testing 2026-09-29",
    customer: "maya.chen@example.com",
    turns: [
      {
        customer: "The Glowworm headlamp from order #1050 arrived with a cracked lens and won't turn on.",
        reply: { amounts: [2900], avoids: ["business days"] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      effects: {
        refunds: [{ order: 1050, amountCents: 2900, reason: "damaged", item: "lamp-glowworm-300", status: "issued" }],
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
    turns: [{ customer: "My order #1055 is really late. Can I at least get my shipping cost back?", reply: { amounts: [799], avoids: ["business days"] } }],
    expect: {
      route: "support",
      outcome: ["resolved", "approval_needed"],
      effects: {
        refunds: [{ order: 1055, amountCents: 799, reason: "late", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, status: "pending_approval" }] },
        escalation: "forbidden",
      },
      judge: "Confirms the $7.99 shipping refund. If it requests a goodwill coupon, it says the coupon needs approval rather than implying it's issued.",
    },
  },
  {
    id: "refund-within-limit-03",
    split: "dev",
    type: "refund_within_limit",
    why: "Same $29.00 Glowworm refund as refund-within-limit-01, but the customer names the item only in turn 2. Tests gathering details before acting. If the agent refunds right after turn 1 (it's the only item on the order), turn 2 won't fit: a script_mismatch, not an agent failure.",
    customer: "maya.chen@example.com",
    turns: [
      { customer: "Something from my order #1050 arrived broken. What can you do?" },
      {
        customer: "It's the Glowworm headlamp. The lens is cracked and it won't turn on.",
        assumes: "the agent asked which item is broken or what's wrong with it",
        reply: { amounts: [2900] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      effects: {
        refunds: [{ order: 1050, amountCents: 2900, reason: "damaged", item: "lamp-glowworm-300", status: "issued" }],
        escalation: "forbidden",
      },
    },
  },
]);
