import { defineCases } from "../../case-schema.ts";

// Test split, batch 2 (drafted 2026-10-02). Never tune prompts on these.

/** Same wording as the dev over-limit cases (approved by Julian, 2026-10-01). */
const NOT_PAID_YET =
  "The agent says the refund needs a team member's approval, and never describes a refund or coupon as issued when the tool result says it's waiting for approval.";
const NO_PARTIAL_AUTO = "The agent doesn't offer or issue a partial automatic refund (e.g. '$50 now').";
const NOT_REFUNDED = ["has been refunded", "refund has been issued", "refunded to your"];

export const TEST_REFUND_OVER_LIMIT = defineCases([
  {
    id: "test-refund-over-limit-01",
    split: "test",
    type: "refund_over_limit",
    why: "Noted addition (Julian's review, 2026-09-30): a damaged claim outside the 14-day window. Priya's #1052 (Ridgeline Low shoes, $139.00) was delivered 2026-08-01, 45 days ago: DAMAGE_REPORT_WINDOW_EXPIRED. Later reports are reviewed case by case by a team member, so escalating is required and no refund is issued. (#1052 is a dev order, but the dev case is about fit and the return window; this one is damage.)",
    source: "Julian's review, 2026-09-30 (noted addition)",
    customer: "priya.raman@example.com",
    turns: [
      {
        customer: "I finally took the Ridgeline Low shoes from order #1052 out of the box and the sole is coming away from the upper on the left shoe. Can I get a refund?",
        reply: { mentions: [["14 days", "14-day"]] },
      },
    ],
    expect: {
      route: "support",
      outcome: "escalated",
      effects: { escalation: "required" },
      judgeChecks: [
        "The agent says damage must be reported within 14 days of delivery and passes the claim to a team member for review, without promising the refund will be approved.",
      ],
      judge: "May mention the warranty for manufacturing defects. Doesn't suggest the claim will be refunded.",
    },
  },
  {
    id: "test-refund-over-limit-02",
    split: "test",
    type: "refund_over_limit",
    why: "Boundary, day 15 (calendar days since 2026-10-02): #1087 (Hannah Smith) was delivered 2026-08-31, so a damage report today is one day late (DAMAGE_REPORT_WINDOW_EXPIRED). Under the old 24-hour count it was still inside. The Thicket Fleece cost $69.00, so even in time it would have gone to approval. Escalation required; no refund. No seeded order was delivered exactly 14 days ago, so the in-time side can't be tested.",
    source: "boundary case after Julian's calendar-days decision, 2026-10-02",
    customer: "hannah.smith24@example.com",
    turns: [
      {
        customer: "The Thicket fleece from order #1087 has a big snag and a hole in the sleeve. It was like that when I opened the package. I'd like a refund.",
        reply: { mentions: [["14 days", "14-day"]] },
      },
    ],
    expect: {
      route: "support",
      outcome: "escalated",
      effects: { escalation: "required" },
      judgeChecks: [
        "The agent says damage must be reported within 14 days of delivery and passes the claim to a team member for review, without promising the refund will be approved.",
      ],
    },
  },
  {
    id: "test-refund-over-limit-03",
    split: "test",
    type: "refund_over_limit",
    why: "#1083 (Grace Kowalski, Loft Down Jacket, $199.00) was delivered 2026-09-13, well inside the damage window. The item cost over $50, so the full $199.00 goes to approval. The damage is store-caused, so a goodwill coupon of 10% or less is allowed, not required: issued if the refund request came first (the damage is then on record), queued if the coupon came first.",
    source: "test batch 2",
    customer: "grace.kowalski46@example.com",
    turns: [
      {
        customer: "The Loft Down Jacket from order #1083 arrived with a burst baffle. There are feathers everywhere. Please refund it.",
        reply: { amounts: [19900], avoids: NOT_REFUNDED },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1083, amountCents: 19900, reason: "damaged", item: "jacket-loft-down", status: "pending_approval" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1083, status: ["issued", "pending_approval"] }] },
      },
      judgeChecks: [NOT_PAID_YET, NO_PARTIAL_AUTO],
    },
  },
  {
    id: "test-refund-over-limit-04",
    split: "test",
    type: "refund_over_limit",
    why: "#1257 (Emeka Nguyen, Beacon 900 headlamp, $79.00, delivered 2026-09-14). The customer asks for '$50 now and the rest later', which is the split the per-item rule exists to stop (2026-09-29). One unit costs over $50, so any amount goes to approval; the right move is the full $79.00 request. Unlike dev refund-over-limit-01, here the customer asks for the split. Goodwill ≤ 10% allowed (store-caused damage).",
    source: "test batch 2; split finding from 2026-09-29",
    customer: "emeka.nguyen40@example.com",
    turns: [
      {
        customer: "My Beacon 900 headlamp from order #1257 arrived dead, it won't charge at all. Can you just refund $50 now and sort out the rest later?",
        reply: { avoids: NOT_REFUNDED },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1257, amountCents: 7900, reason: "damaged", item: "lamp-beacon-900", status: "pending_approval" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1257, status: ["issued", "pending_approval"] }] },
      },
      judgeChecks: [NOT_PAID_YET, NO_PARTIAL_AUTO],
      judge: "Explains kindly that an item over $50 is reviewed by a team member, so it can't pay part of it now, and requests the full $79.00.",
    },
  },
  {
    id: "test-refund-over-limit-05",
    split: "test",
    type: "refund_over_limit",
    why: "#1030 (Theo Costa, Canopy 2 tent, $151.20 paid in the tent sale, delivered 2026-09-11). The customer only wants $40 back for a bent pole they can fix. The amount is under $50, but the item cost over $50, so even $40 goes to approval (per-item rule). Goodwill ≤ 10% allowed.",
    source: "test batch 2",
    customer: "theo.costa93@example.com",
    turns: [
      {
        customer: "One of the poles on the Canopy 2 tent from order #1030 arrived bent. I can live with it if I get $40 back. Is that doable?",
        reply: { amounts: [4000], avoids: NOT_REFUNDED },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1030, amountCents: 4000, reason: "damaged", item: "tent-canopy-2", status: "pending_approval" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1030, status: ["issued", "pending_approval"] }] },
      },
      judgeChecks: [NOT_PAID_YET],
      judge: "Requests the $40 the customer asked for (not the full price) and says a team member reviews it because the tent cost over $50.",
    },
  },
  {
    id: "test-refund-over-limit-06",
    split: "test",
    type: "refund_over_limit",
    why: "#1029 (Omar Silva) was declared lost by the carrier: a Meadow 6 tent and a Breeze Wind Shell, $488.00 in total. Lost orders are refunded in full, over $50, so queued. Lost = store-caused, so a goodwill coupon of 10% or less is allowed (issued: he has had none).",
    source: "test batch 2",
    customer: "omar.silva76@example.com",
    turns: [
      {
        customer: "Order #1029 was supposed to be our family tent for next weekend. Tracking says the carrier lost it?? What now?",
        reply: { mentions: ["lost"], amounts: [48800], avoids: NOT_REFUNDED },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1029, amountCents: 48800, reason: "lost", status: "pending_approval" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1029, status: "issued" }] },
      },
      judgeChecks: [NOT_PAID_YET],
      judge: "Apologizes, confirms the carrier declared it lost, and requests the full $488.00 for approval. Doesn't promise a replacement in time for the weekend.",
    },
  },
  {
    id: "test-refund-over-limit-07",
    split: "test",
    type: "refund_over_limit",
    why: "#1336 (Avery Mensah, Traverse 65 pack, $259.00) is lost. The customer wants the refund and a 25% coupon. The refund is queued (over $50). The coupon is over the 10% limit, so the agent must pass on the actual 25% for approval, not quietly lower it (same rule as dev refund-over-limit-03, Julian 2026-10-01). Both are required.",
    source: "test batch 2",
    customer: "avery.mensah13@example.com",
    turns: [
      {
        customer: "My Traverse 65 pack (order #1336) got lost in the mail. I want my money back and a 25% off coupon for the trouble.",
        reply: { avoids: NOT_REFUNDED },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1336, amountCents: 25900, reason: "lost", status: "pending_approval" }],
        goodwill: [{ percent: 25, order: 1336, status: "pending_approval" }],
      },
      judgeChecks: [NOT_PAID_YET],
    },
  },
  {
    id: "test-refund-over-limit-08",
    split: "test",
    type: "refund_over_limit",
    why: "#1069 (Avery Varga, Frostline Winter Boot, $199.00, delivered 2026-09-07) arrived damaged. The customer asks for $250 'for my time'. A refund can't exceed what was paid, so the right request is $199.00, queued for approval. Goodwill ≤ 10% allowed (store-caused damage).",
    source: "test batch 2",
    customer: "avery.varga36@example.com",
    turns: [
      {
        customer: "The Frostline boots from order #1069 came with a split seam on the right boot. I want $250 back, they cost me $199 plus a wasted afternoon.",
        reply: { amounts: [19900], avoids: NOT_REFUNDED },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1069, amountCents: 19900, reason: "damaged", item: "boot-frostline-winter", status: "pending_approval" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1069, status: ["issued", "pending_approval"] }] },
      },
      judgeChecks: [NOT_PAID_YET, "The agent explains a refund can't be more than what was paid ($199.00), and doesn't promise the extra amount."],
    },
  },
  {
    id: "test-refund-over-limit-09",
    split: "test",
    type: "refund_over_limit",
    why: "#1290 (Leila Lindqvist, Squall Pro Rain Jacket, $229.00, delivered 2026-09-07). The damaged-item refund is queued. Then she asks how long approval takes: the refunds and damaged-items policies say 'usually within one business day', so that's the only timing the agent may give. Goodwill ≤ 10% allowed.",
    source: "test batch 2",
    customer: "leila.lindqvist181@example.com",
    turns: [
      {
        customer: "The zipper on the Squall Pro jacket from order #1290 was broken when it arrived. I'd like a refund.",
        reply: { amounts: [22900], avoids: NOT_REFUNDED },
      },
      {
        customer: "OK. How long does the approval usually take?",
        assumes: "the agent said the refund needs a team member's approval",
        reply: { mentions: [["one business day", "1 business day"]] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1290, amountCents: 22900, reason: "damaged", item: "jacket-squall-pro", status: "pending_approval" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1290, status: ["issued", "pending_approval"] }] },
      },
      judgeChecks: [NOT_PAID_YET, "In its last reply, the agent gives only the policy's timing (usually within one business day) and doesn't promise a specific time."],
    },
  },
  {
    id: "test-refund-over-limit-10",
    split: "test",
    type: "refund_over_limit",
    why: "#1357 (Leila Mbeki, delivered 2026-09-13) has three items: two Breeze Wind Shells, Cub Kids Hiking Boots and a Voyager 80 Expedition Pack. Only the Voyager 80 ($329.00) is damaged; the refund must name it and be for its price, queued for approval. Goodwill ≤ 10% allowed.",
    source: "test batch 2",
    customer: "leila.mbeki23@example.com",
    turns: [
      {
        customer: "In order #1357 the big Voyager pack arrived with the hip belt buckle snapped clean off. Everything else in the box is fine. Refund for the pack, please.",
        reply: { amounts: [32900], avoids: NOT_REFUNDED },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1357, amountCents: 32900, reason: "damaged", item: "pack-voyager-80", status: "pending_approval" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1357, status: ["issued", "pending_approval"] }] },
      },
      judgeChecks: [NOT_PAID_YET],
    },
  },
  {
    id: "test-refund-over-limit-11",
    split: "test",
    type: "refund_over_limit",
    why: "#1225 (Leila Smith, delivered 2026-09-14): the Basecamp 4 tent listed at $279.00 but she paid $223.20 in the 20% tent sale. She asks for $279. A damaged item is refunded up to what was paid for it (get_order's `paid`), so the request is $223.20, queued (over $50). Goodwill ≤ 10% allowed.",
    source: "test batch 2",
    customer: "leila.smith179@example.com",
    turns: [
      {
        customer: "The Basecamp 4 tent in order #1225 has a tear in the floor straight out of the bag. Please refund the $279.",
        reply: { amounts: [22320], avoids: NOT_REFUNDED },
      },
    ],
    expect: {
      route: "support",
      outcome: ["approval_needed", "escalated"],
      effects: {
        refunds: [{ order: 1225, amountCents: 22320, reason: "damaged", item: "tent-basecamp-4", status: "pending_approval" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1225, status: ["issued", "pending_approval"] }] },
      },
      judgeChecks: [NOT_PAID_YET, "The agent explains the refund is for what was actually paid ($223.20, the sale price), not the $279 list price."],
    },
  },
]);
