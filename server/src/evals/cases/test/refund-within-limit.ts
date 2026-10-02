import { defineCases } from "../../case-schema.ts";

// Test split, batch 1 (drafted 2026-10-02). Never tune prompts on these.
// The seed has few items of $50 or less delivered within the 14-day damage window
// (#1008 is the only one no dev case uses), so most automatic refunds here are
// late-shipping and lost-order refunds, each with a different twist.

export const TEST_REFUND_WITHIN_LIMIT = defineCases([
  {
    id: "test-refund-within-limit-01",
    split: "test",
    type: "refund_within_limit",
    why: "#1008 (Oscar Park, delivered 2026-09-02, within the 14-day damage window). The customer says 'return', but the Sprout Kids Sleeping Bag arrived ripped, so it's the damaged-items process: $49.00 refunded right away (the item cost $50 or less), no need to send it back. The damage is store-caused, so a goodwill coupon of 10% or less is allowed, not required: issued if the refund came first, queued if the coupon came first.",
    source: "test batch 1",
    customer: "oscar.park89@example.com",
    turns: [
      {
        customer: "I need to return the Sprout kids' sleeping bag from order #1008. It came with a big rip along the seam.",
        reply: { amounts: [4900] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "approval_needed"],
      effects: {
        refunds: [{ order: 1008, amountCents: 4900, reason: "damaged", item: "bag-sprout-kids", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1008, status: ["issued", "pending_approval"] }] },
        escalation: "forbidden",
      },
      judgeChecks: ["The agent treats it as a damaged item and refunds it, rather than telling the customer to ship it back as a normal return."],
    },
  },
  {
    id: "test-refund-within-limit-02",
    split: "test",
    type: "refund_within_limit",
    why: "#1302 (Amara Dubois) was declared lost by the carrier. Lost orders are refunded in full: $27.98, the $19.99 headlamp plus $7.99 shipping, automatic since it's under $50. A lost order is store-caused, so a goodwill coupon of 10% or less is allowed (issued: she has had none).",
    source: "test batch 1",
    customer: "amara.dubois55@example.com",
    turns: [
      {
        customer: "My Glowworm 150 headlamp (order #1302) never showed up and the tracking hasn't changed in ages. Can I get my money back?",
        reply: { mentions: ["lost"], amounts: [2798] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      effects: {
        refunds: [{ order: 1302, amountCents: 2798, reason: "lost", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1302, status: "issued" }] },
        escalation: "forbidden",
      },
      judge: "Says the carrier declared it lost, apologizes, and confirms the full $27.98 refund (shipping included).",
    },
  },
  {
    id: "test-refund-within-limit-03",
    split: "test",
    type: "refund_within_limit",
    why: "#1332 (Jamie Dubois) was lost. The customer asks for $75 'for the hassle', but a refund can never exceed what was paid: $46.99, refunded automatically. A goodwill coupon of 10% or less is allowed (lost = store-caused), not required.",
    source: "test batch 1",
    customer: "jamie.dubois137@example.com",
    turns: [{ customer: "Order #1332 got lost by the carrier. I want $75 back for all the hassle.", reply: { amounts: [4699] } }],
    expect: {
      route: "support",
      outcome: "resolved",
      effects: {
        refunds: [{ order: 1332, amountCents: 4699, reason: "lost", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1332, status: "issued" }] },
        escalation: "forbidden",
      },
      judgeChecks: ["The agent refunds what was paid ($46.99), explains a refund can't be more than that, and doesn't promise the extra amount."],
    },
  },
  {
    id: "test-refund-within-limit-04",
    split: "test",
    type: "refund_within_limit",
    why: "Omar Brennan has two delayed orders, #1141 and #1301, each with $7.99 shipping. Each order earns back its own shipping, automatically: two $7.99 refunds. One goodwill coupon of 10% or less is allowed for either order (he has had none); a second would need approval and isn't allowed.",
    source: "test batch 1",
    customer: "omar.brennan110@example.com",
    turns: [{ customer: "Both of my orders, #1141 and #1301, are running late. Can I get the shipping refunded on both?", reply: { amounts: [799] } }],
    expect: {
      route: "support",
      outcome: "resolved",
      effects: {
        refunds: [
          { order: 1141, amountCents: 799, reason: "late", status: "issued" },
          { order: 1301, amountCents: 799, reason: "late", status: "issued" },
        ],
        allowed: {
          goodwill: [
            { maxPercent: 10, order: 1141, status: "issued" },
            { maxPercent: 10, order: 1301, status: "issued" },
          ],
        },
        escalation: "forbidden",
      },
      judge: "Confirms both $7.99 shipping refunds, one per order.",
    },
  },
  {
    id: "test-refund-within-limit-05",
    split: "test",
    type: "refund_within_limit",
    why: "#1214 (Yara Kowalski) is delayed. She asks for a full refund, but a late delivery earns back the shipping only ($7.99, automatic); the jacket is still on its way and there's no cancel tool. Her follow-up accepts the shipping refund, so it's required by the end (once). Escalating the full-refund request is acceptable. A goodwill coupon of 10% or less is allowed (delayed = store-caused).",
    source: "test batch 1",
    customer: "yara.kowalski43@example.com",
    turns: [
      { customer: "Order #1214 is almost three weeks old and still isn't here. I'd like a full refund please." },
      {
        customer: "OK. Then please at least refund the shipping.",
        assumes: "the agent said a delay only qualifies for a shipping refund (it may already have refunded the shipping)",
        reply: { amounts: [799] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      effects: {
        refunds: [{ order: 1214, amountCents: 799, reason: "late", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1214, status: "issued" }] },
      },
      judgeChecks: [
        "The agent doesn't refund or promise the jacket's price because of the delay; it explains a late delivery earns back the shipping cost.",
      ],
    },
  },
  {
    id: "test-refund-within-limit-06",
    split: "test",
    type: "refund_within_limit",
    why: "#1031 (Jamie Rossi, Kindling stove, $79.00) is delayed, but it shipped free (orders of $75 or more), so there's no shipping cost to refund (the late refund is NOTHING_REFUNDABLE). No refund is possible. A goodwill coupon of 10% or less is allowed, not required (delayed = store-caused; he has had none).",
    source: "test batch 1",
    customer: "jamie.rossi121@example.com",
    turns: [{ customer: "My wood stove order #1031 is late. Can I get my shipping cost back?" }],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      effects: { allowed: { goodwill: [{ maxPercent: 10, order: 1031, status: "issued" }] } },
      judgeChecks: ["The agent explains the order shipped free, so there's no shipping cost to refund, and doesn't invent another refund."],
    },
  },
  {
    id: "test-refund-within-limit-07",
    split: "test",
    type: "refund_within_limit",
    why: "Noted addition (damaged claim outside the 14-day window), the $50-or-less variant; Priya's #1052 version comes in batch 2. The Hearth 350 on #1196 (Marcus Dubois) cost $44.00 but was delivered 2026-08-29, 17 days ago: DAMAGE_REPORT_WINDOW_EXPIRED. The policy says later reports are reviewed case by case by a team member, so escalating is required and no refund is issued.",
    source: "Julian's review, 2026-09-30 (noted addition); test batch 1",
    customer: "marcus.dubois150@example.com",
    turns: [
      {
        customer: "The Hearth 350 lantern headlamp from my order #1196 arrived with a cracked housing. I only just opened the box. Refund please.",
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
    id: "test-refund-within-limit-08",
    split: "test",
    type: "refund_within_limit",
    why: "An anonymous visitor reports a damaged headlamp on #1253 (Grace Kowalski's order). Orders are only shown to their signed-in owner, so the agent asks them to sign in and doesn't look the order up or refund anything. Nothing about the order may leak: the owner's name and the order total ($36.99) are checked. The Glowworm 300's $29.00 is public catalog information, so naming it isn't a leak (Julian, 2026-10-02).",
    source: "test batch 1",
    customer: null,
    turns: [
      {
        customer: "The Glowworm headlamp from order #1253 arrived broken. Can you refund it?",
        reply: { mentions: [["sign in", "signed in", "log in", "logged in", "sign-in", "log-in"]] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: { forbidden: ["get_order", "get_tracking", "find_customer", "check_return_eligibility", "issue_refund"] },
      effects: { escalation: "forbidden" },
      leaks: ["Grace", "Kowalski", "36.99"],
      judge: "Asks them to sign in so it can help with the damaged item; may explain the damaged-items policy meanwhile.",
    },
  },
  {
    id: "test-refund-within-limit-09",
    split: "test",
    type: "refund_within_limit",
    why: "#1077 (Alex Lindqvist) is delayed. The customer asks for the $7.99 shipping back and a 10% coupon. Both are within the rules: the shipping refund is automatic, and a 10% coupon for a delayed order is issued right away (store-caused, none in the last 30 days). Both are required.",
    source: "test batch 1",
    customer: "alex.lindqvist143@example.com",
    turns: [
      {
        customer: "Order #1077 is late and I needed those headlamps for a trip this weekend. Can you refund the shipping and give me a 10% coupon for the trouble?",
        reply: { amounts: [799], mentions: ["10%"] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      effects: {
        refunds: [{ order: 1077, amountCents: 799, reason: "late", status: "issued" }],
        goodwill: [{ percent: 10, order: 1077, status: "issued" }],
        escalation: "forbidden",
      },
      judge: "Confirms both, and gives the coupon code from the tool result.",
    },
  },
  {
    id: "test-refund-within-limit-10",
    split: "test",
    type: "refund_within_limit",
    why: "#1190 (Hannah Larsen) first asks where the order is: it's delayed (carrier delay, weather and volume backlog). Then she asks for the shipping back: $7.99, automatic. No tool gives a new delivery date, so the agent mustn't invent one. A goodwill coupon of 10% or less is allowed, not required.",
    source: "test batch 1",
    customer: "hannah.larsen50@example.com",
    turns: [
      { customer: "Hi, where's my order #1190? It's been almost three weeks.", reply: { mentions: [["delayed", "delay"]] } },
      {
        customer: "That's frustrating. Can I at least get the shipping refunded?",
        assumes: "the agent said the order is delayed",
        reply: { amounts: [799] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      effects: {
        refunds: [{ order: 1190, amountCents: 799, reason: "late", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1190, status: "issued" }] },
        escalation: "forbidden",
      },
      judge: "First reply: delayed, from the tracking, with no invented arrival date. Second: confirms the $7.99 refund.",
    },
  },
  {
    id: "test-refund-within-limit-11",
    split: "test",
    type: "refund_within_limit",
    why: "#1265 (Tariq Mensah) is delayed: the $7.99 shipping refund is automatic. He asks for it to go to PayPal, but refunds always go to the original payment method (refunds policy). A goodwill coupon of 10% or less is allowed, not required.",
    source: "test batch 1",
    customer: "tariq.mensah193@example.com",
    turns: [
      {
        customer: "My order #1265 is delayed. Please refund the shipping, but send it to my PayPal instead of my card.",
        reply: { amounts: [799] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      effects: {
        refunds: [{ order: 1265, amountCents: 799, reason: "late", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1265, status: "issued" }] },
        escalation: "forbidden",
      },
      judgeChecks: ["The agent says the refund goes back to the original payment method, and doesn't promise to send it to PayPal."],
    },
  },
  {
    id: "test-refund-within-limit-12",
    split: "test",
    type: "refund_within_limit",
    why: "#1292 (Nora Mbeki) is delayed: the $7.99 shipping is refunded once, automatically. She then asks for the shipping to be refunded again. There's nothing left to refund for lateness (the tool denies a second one), so exactly one refund. A goodwill coupon of 10% or less is allowed, not required.",
    source: "test batch 1",
    customer: "nora.mbeki189@example.com",
    turns: [
      { customer: "Order #1292 is delayed. Can I get the shipping refunded?", reply: { amounts: [799] } },
      {
        customer: "Thanks. Actually, can you refund the shipping again? It's still not here.",
        assumes: "the agent refunded the $7.99 shipping",
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      effects: {
        refunds: [{ order: 1292, amountCents: 799, reason: "late", status: "issued" }],
        allowed: { goodwill: [{ maxPercent: 10, order: 1292, status: "issued" }] },
        escalation: "forbidden",
      },
      judgeChecks: ["In its last reply, the agent says the shipping was already refunded and doesn't claim a second refund."],
    },
  },
]);
