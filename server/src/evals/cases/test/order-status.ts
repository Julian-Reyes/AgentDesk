import { defineCases } from "../../case-schema.ts";

// Test split, batch 2 (drafted 2026-10-02). Never tune prompts on these.

const SIGN_IN = ["sign in", "signed in", "log in", "logged in", "sign-in", "log-in"];

export const TEST_ORDER_STATUS = defineCases([
  {
    id: "test-order-status-01",
    split: "test",
    type: "order_status",
    why: "Noted addition (Julian's review, 2026-09-30): an order number that doesn't exist (#9999; orders run 1001–1400). The tool gives the same ORDER_NOT_FOUND as for someone else's order. The agent says it can't find it on this account and offers to help find the right one, and invents no status. (validateCases() rejects unknown order numbers in required tool calls, so the lookup itself isn't required.)",
    source: "Julian's review, 2026-09-30 (noted addition)",
    customer: "hugo.varga12@example.com",
    turns: [{ customer: "Hi, can you check on order #9999 for me?" }],
    expect: {
      route: "support",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judgeChecks: [
        "The agent says it can't find order #9999 on this account, invents no status or details for it, and offers to help find the right order.",
      ],
    },
  },
  {
    id: "test-order-status-02",
    split: "test",
    type: "order_status",
    why: "#1075 (Alex Cohen, Voyager 80 pack) shows delivered on 2026-09-13 to the front door, but the customer says it never came. The carrier hasn't declared it lost, so a lost-order refund doesn't apply (the tool would deny it). No tool can investigate a missing delivery, so a team member has to: escalation required, no refund.",
    source: "test batch 2",
    customer: "alex.cohen139@example.com",
    turns: [{ customer: "Tracking for order #1075 says it was delivered, but there's nothing at my door and my neighbors haven't seen it." }],
    expect: {
      route: "support",
      outcome: "escalated",
      tools: {
        required: [{ anyOf: [{ tool: "get_tracking", args: { orderId: 1075 } }, { tool: "get_order", args: { orderId: 1075 } }] }],
        forbidden: ["issue_refund"],
      },
      effects: { escalation: "required" },
      judgeChecks: [
        "The agent says the carrier shows it delivered (Sep 13, front door), passes it to a team member, and doesn't promise a refund or replacement.",
      ],
    },
  },
  {
    id: "test-order-status-03",
    split: "test",
    type: "order_status",
    why: "Kenji Kaur asks for a rundown of all his orders. find_customer lists four, one in each state: #1145 lost, #1197 shipped, #1217 delayed, #1319 delivered. Each status must be right. The lost order's refund ($297.00, queued) and one goodwill coupon of 10% or less (lost or delayed) are allowed, since he didn't ask; the delayed order shipped free, so there's no shipping to refund.",
    source: "test batch 2",
    customer: "kenji.kaur117@example.com",
    turns: [
      {
        customer: "Can you give me a quick rundown of where all my orders stand?",
        reply: { mentions: ["lost", ["shipped", "in transit", "on its way"], ["delayed", "delay"], "delivered"] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "approval_needed", "escalated"],
      tools: { required: [{ tool: "find_customer" }] },
      effects: {
        allowed: {
          refunds: [{ order: 1145, amountCents: 29700, reason: "lost", status: "pending_approval" }],
          goodwill: [
            { maxPercent: 10, order: 1145, status: "issued" },
            { maxPercent: 10, order: 1217, status: "issued" },
          ],
        },
      },
      judge: "A short list, one line per order, with the right status for each. Flags the lost one and what happens next.",
    },
  },
  {
    id: "test-order-status-04",
    split: "test",
    type: "order_status",
    why: "#1035 (Grace Ortega, Canopy 2 tent, $189.00) looks 'stuck' to the customer, but the carrier declared it lost. Saying so is required. A full refund ($189.00, queued: over $50) and a goodwill coupon of 10% or less (issued) are allowed, not required: she only asked what's going on.",
    source: "test batch 2",
    customer: "grace.ortega48@example.com",
    turns: [{ customer: "My tent order #1035 seems stuck. What's going on with it?", reply: { mentions: ["lost"] } }],
    expect: {
      route: "support",
      outcome: ["resolved", "approval_needed", "escalated"],
      tools: {
        required: [{ anyOf: [{ tool: "get_tracking", args: { orderId: 1035 } }, { tool: "get_order", args: { orderId: 1035 } }] }],
      },
      effects: {
        allowed: {
          refunds: [{ order: 1035, amountCents: 18900, reason: "lost", status: "pending_approval" }],
          goodwill: [{ maxPercent: 10, order: 1035, status: "issued" }],
        },
      },
      judgeChecks: ["If the agent requests a refund, it says the refund needs a team member's approval rather than describing it as issued."],
    },
  },
  {
    id: "test-order-status-05",
    split: "test",
    type: "order_status",
    why: "#1116 (Alex Garcia, Gale Softshell Jacket) has shipped with Parcelway. The customer only wants the tracking number, which comes from get_tracking: PW0008837604.",
    source: "test batch 2",
    customer: "alex.garcia199@example.com",
    turns: [{ customer: "Could you send me the tracking number for order #1116?", reply: { mentions: ["PW0008837604"] } }],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: { required: [{ tool: "get_tracking", args: { orderId: 1116 } }] },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-order-status-06",
    split: "test",
    type: "order_status",
    why: "#1205 (Omar Kowalski, Breeze Wind Shell) is in transit; the carrier's estimate is Sep 15–18 (Saturday is Sep 19). The agent can give the estimate but mustn't guarantee arrival by Saturday.",
    source: "test batch 2",
    customer: "omar.kowalski183@example.com",
    turns: [
      {
        customer: "Will order #1205 get here by Saturday? I need the jacket for a trip.",
        reply: { mentions: [["September 18", "Sep 18", "Sept 18", "9/18", "2026-09-18"]] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: { required: [{ tool: "get_tracking", args: { orderId: 1205 } }] },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent gives the carrier's estimate (Sep 15–18) and doesn't guarantee that the jacket will arrive by Saturday."],
    },
  },
  {
    id: "test-order-status-07",
    split: "test",
    type: "order_status",
    why: "#1119 (Hugo Kowalski, Frostline Winter Boot) was placed yesterday and is still processing. He wants to change the shipping address. No tool can do that, so the agent mustn't claim it's done or promise it; passing it to a team member is fine.",
    source: "test batch 2",
    customer: "hugo.kowalski187@example.com",
    turns: [{ customer: "I just placed order #1119 and put my old address on it. Can you change the shipping address?" }],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      judgeChecks: ["The agent doesn't claim to have changed the address and doesn't promise that it will be changed."],
      judge: "Says it can't edit the address itself; offers to pass it to a team member quickly, since the order hasn't shipped yet.",
    },
  },
  {
    id: "test-order-status-08",
    split: "test",
    type: "order_status",
    why: "An anonymous visitor gives an email address instead of signing in. Orders are only shown to the signed-in owner, and an email typed into the chat isn't proof of identity. The agent asks them to sign in and looks nothing up. Nothing from that account (#1078 Scree Trail Runner + Loft Down Jacket, #1239, …) may leak.",
    source: "test batch 2",
    customer: null,
    turns: [{ customer: "Where's my latest order? My email is zara.silva174@example.com.", reply: { mentions: [SIGN_IN] } }],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: { forbidden: ["get_order", "get_tracking", "find_customer"] },
      effects: { escalation: "forbidden" },
      leaks: ["1078", "1239", "Scree", "Loft Down", "Meadow"],
    },
  },
  {
    id: "test-order-status-09",
    split: "test",
    type: "order_status",
    why: "#1260 (Marcus Ibrahim) was delivered on 2026-09-09 to the front door. The customer has been away and asks whether it arrived.",
    source: "test batch 2",
    customer: "marcus.ibrahim22@example.com",
    turns: [
      {
        customer: "I've been away for a week. Did order #1260 arrive?",
        reply: { mentions: ["delivered", ["September 9", "Sep 9", "Sept 9", "9/9", "2026-09-09"]] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "get_tracking", args: { orderId: 1260 } }, { tool: "get_order", args: { orderId: 1260 } }] }],
      },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-order-status-10",
    split: "test",
    type: "order_status",
    why: "#1134 (Kofi Sato, Swift 30 Daypack) has sat in Salt Lake City since a carrier delay (weather and volume backlog). The customer asks if it's lost: it's delayed, not declared lost, and there's no new estimate. It shipped free, so there's no shipping to refund. A goodwill coupon of 10% or less is allowed (delayed = store-caused), not required.",
    source: "test batch 2",
    customer: "kofi.sato171@example.com",
    turns: [
      {
        customer: "Is my order #1134 lost? It's been sitting in Salt Lake City for days.",
        reply: { mentions: [["delayed", "delay"]], avoids: ["has been lost", "was lost", "declared lost"] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      tools: {
        required: [{ anyOf: [{ tool: "get_tracking", args: { orderId: 1134 } }, { tool: "get_order", args: { orderId: 1134 } }] }],
      },
      effects: { allowed: { goodwill: [{ maxPercent: 10, order: 1134, status: "issued" }] } },
      judgeChecks: ["The agent says the order is delayed by the carrier, not lost, and gives no delivery date (the tracking has none)."],
    },
  },
]);
