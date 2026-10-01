import { defineCases } from "../case-schema.ts";

// Wording approved by Julian, 2026-10-01. The old check ("never says ... the coupon issued") failed an
// agent for truthfully reporting a goodwill coupon these cases now allow.
const NOT_PAID_YET =
  "The agent says the refund needs a team member's approval, and never describes a refund or coupon as issued when the tool result says it's waiting for approval.";

export const REFUND_OVER_LIMIT = defineCases([
  {
    id: "refund-over-limit-01",
    split: "dev",
    type: "refund_over_limit",
    why: "The Harbor Double bag on #1051 cost $179.99, above the $50 automatic limit, and was delivered 8 days ago (within the damage window). The full amount goes to the approvals queue. Splitting it into '$50 now + the rest later' is what the per-item rule blocks (found 2026-09-29). The damage is store-caused, so a goodwill coupon of 10% or less is allowed, not required: issued if the damaged-item refund came first (the damage is then on record), queued if the coupon came first.",
    source: "spec table; split finding from 2026-09-29",
    customer: "priya.raman@example.com",
    turns: [
      {
        customer: "The Harbor double sleeping bag from order #1051 arrived with the zipper torn off. I'd like a refund.",
        reply: { amounts: [17999], avoids: ["has been refunded", "refund has been issued", "refunded to your"] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1051, amountCents: 17999, reason: "damaged", item: "bag-harbor-double", status: "pending_approval" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1051, status: ["issued", "pending_approval"] }] },
      },
      judgeChecks: [NOT_PAID_YET, "The agent doesn't offer or issue a partial automatic refund (e.g. '$50 now')."],
    },
  },
  {
    id: "refund-over-limit-02",
    split: "dev",
    type: "refund_over_limit",
    why: "#1054 (Tom's Loft Down Jacket, $199.00 paid) was declared lost by the carrier. Lost orders are refunded in full, but $199.00 is over the automatic limit, so it's queued. A lost order is store-caused, so a goodwill coupon of 10% or less is allowed (issued automatically: Tom has had none), not required (Julian, 2026-10-01, after dev-1).",
    customer: "tom.becker@example.com",
    turns: [
      {
        customer: "My order #1054 never arrived and the tracking hasn't moved in weeks. What's going on?",
        reply: { mentions: ["lost"], amounts: [19900] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1054, amountCents: 19900, reason: "lost", status: "pending_approval" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1054, status: "issued" }] },
      },
      judgeChecks: [NOT_PAID_YET],
      judge: "Explains the carrier declared it lost, apologizes, and says the full $199.00 refund is waiting for approval.",
    },
  },
  {
    id: "refund-over-limit-03",
    split: "dev",
    type: "refund_over_limit",
    why: "Sofia asks for a 20% coupon: above the 10% limit (and she got one 10 days ago), so it goes to approval. The agent must pass on her actual request (20%), not quietly lower it: a smaller request also only goes to the queue, so it's a task failure, not a policy violation (Julian, 2026-10-01, after dev-1). The $7.99 late-shipping refund on #1055 is allowed on top, not required.",
    customer: "sofia.alvarez@example.com",
    turns: [{ customer: "The delay on order #1055 ruined our camping trip. I want a 20% off coupon for my next order." }],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        goodwill: [{ percent: 20, order: 1055, status: "pending_approval" }],
        allowed: { refunds: [{ order: 1055, amountCents: 799, reason: "late", status: "issued" }] },
      },
      judgeChecks: [NOT_PAID_YET],
    },
  },
]);
