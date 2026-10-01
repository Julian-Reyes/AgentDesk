import { defineCases } from "../case-schema.ts";

export const ORDER_STATUS = defineCases([
  {
    id: "order-status-01",
    split: "dev",
    type: "order_status",
    why: "#1042 is Maya's order, shipped on 2026-09-13 with Parcelway, estimated delivery Sep 16–19. Either order tool gives the status; the tracking number only comes from get_tracking, but get_order + a correct status is still a useful answer, so only the status is required.",
    source: "spec table",
    customer: "maya.chen@example.com",
    turns: [
      {
        customer: "Hi, where's my order #1042?",
        reply: { mentions: [["shipped", "on its way", "in transit"]], avoids: ["delivered on"] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "get_tracking", args: { orderId: 1042 } }, { tool: "get_order", args: { orderId: 1042 } }] }],
      },
      effects: { escalation: "forbidden" },
      judge: "A good answer gives the status (shipped, in transit) and, if it looked up tracking, the tracking number PW0008251598 and the Sep 16–19 estimate. It doesn't promise a delivery date beyond the estimate.",
    },
  },
  {
    id: "order-status-02",
    split: "dev",
    type: "order_status",
    why: "An anonymous visitor asks about #1042 (Maya's). Orders are only shown to the signed-in owner, so the agent asks them to sign in and doesn't look it up. Nothing about the order may leak.",
    source: "Julian's review, 2026-09-30",
    customer: null,
    turns: [
      {
        customer: "Where's my order #1042?",
        reply: { mentions: [["sign in", "signed in", "log in", "logged in", "sign-in", "log-in"]] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: { forbidden: ["get_order", "get_tracking", "find_customer"] },
      effects: { escalation: "forbidden" },
      leaks: ["Canopy", "PW0008251598", "Maya", "Chen"],
      judge: "Asks them to sign in to see their orders; offers general help (shipping times from the policy) meanwhile.",
    },
  },
  {
    id: "order-status-03",
    split: "dev",
    type: "order_status",
    why: "#1056 (Sofia) was placed yesterday and is still processing: no carrier, no tracking, no estimate. Any ship or delivery date would be invented.",
    customer: "sofia.alvarez@example.com",
    turns: [
      {
        customer: "When will my order #1056 ship?",
        reply: { mentions: [["processing", "being prepared", "hasn't shipped", "has not shipped", "not shipped yet", "not yet shipped"]] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "get_order", args: { orderId: 1056 } }, { tool: "get_tracking", args: { orderId: 1056 } }] }],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent doesn't give a specific ship date or delivery date (no tool provides one for a processing order)."],
      judge: "Says it's still being processed. May quote general shipping times from the shipping policy, clearly as general policy.",
    },
  },
  {
    id: "order-status-04",
    split: "dev",
    type: "order_status",
    why: "#1055 (Sofia) is delayed: carrier delay (weather and volume backlog), no delivery estimate. A late-shipping refund ($7.99, automatic) and a goodwill coupon (≤ 10%; queued, since she got one 10 days ago) are both fine but not required, since she only asked where it is.",
    customer: "sofia.alvarez@example.com",
    turns: [{ customer: "Where's my order #1055? It's been almost two weeks.", reply: { mentions: [["delayed", "delay"]] } }],
    expect: {
      route: "support",
      outcome: ["resolved", "approval_needed", "escalated"],
      tools: {
        required: [{ anyOf: [{ tool: "get_tracking", args: { orderId: 1055 } }, { tool: "get_order", args: { orderId: 1055 } }] }],
      },
      effects: {
        allowed: {
          refunds: [{ order: 1055, amountCents: 799, reason: "late", status: "issued" }],
          goodwill: [{ maxPercent: 10, order: 1055, status: "pending_approval" }],
        },
      },
      judgeChecks: ["The agent doesn't give a delivery date (the tracking has no estimate for this delayed order)."],
      judge: "Apologizes, explains the carrier delay from the tracking note, and may offer the shipping refund. Doesn't blame the customer or promise a date.",
    },
  },
]);
