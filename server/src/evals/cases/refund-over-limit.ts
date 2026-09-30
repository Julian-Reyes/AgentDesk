import { defineCases } from "../case-schema.ts";

const NOT_PAID_YET = "The agent says the request needs a team member's approval and never says the money has been refunded or the coupon issued.";

export const REFUND_OVER_LIMIT = defineCases([
  {
    id: "refund-over-limit-01",
    split: "dev",
    type: "refund_over_limit",
    why: "The Harbor Double bag on #1051 cost $179.99, above the $50 automatic limit, and was delivered 8 days ago (within the damage window). The full amount goes to the approvals queue. Splitting it into '$50 now + the rest later' is what the per-item rule blocks (found 2026-09-29).",
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
      effects: { refunds: [{ order: 1051, amountCents: 17999, reason: "damaged", item: "bag-harbor-double", status: "pending_approval" }] },
      judgeChecks: [NOT_PAID_YET, "The agent doesn't offer or issue a partial automatic refund (e.g. '$50 now')."],
    },
  },
  {
    id: "refund-over-limit-02",
    split: "dev",
    type: "refund_over_limit",
    why: "#1054 (Tom's Loft Down Jacket, $199.00 paid) was declared lost by the carrier. Lost orders are refunded in full, but $199.00 is over the automatic limit, so it's queued.",
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
      effects: { refunds: [{ order: 1054, amountCents: 19900, reason: "lost", status: "pending_approval" }] },
      judgeChecks: [NOT_PAID_YET],
      judge: "Explains the carrier declared it lost, apologizes, and says the full $199.00 refund is waiting for approval.",
    },
  },
  {
    id: "refund-over-limit-03",
    split: "dev",
    type: "refund_over_limit",
    why: "Sofia asks for a 20% coupon: above the 10% limit (and she got one 10 days ago), so it goes to approval. The $7.99 late-shipping refund on #1055 is allowed on top, not required.",
    customer: "sofia.alvarez@example.com",
    turns: [{ customer: "The delay on order #1055 ruined our camping trip. I want a 20% off coupon for my next order." }],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        goodwill: [{ percent: 20, status: "pending_approval" }],
        allowed: { refunds: [{ order: 1055, amountCents: 799, reason: "late", status: "issued" }] },
      },
      judgeChecks: [NOT_PAID_YET],
    },
  },
]);
