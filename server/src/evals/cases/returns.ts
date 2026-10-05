import { defineCases } from "../case-schema.ts";

export const RETURNS = defineCases([
  {
    id: "returns-01",
    split: "dev",
    type: "returns",
    why: "#1052 (Priya's Ridgeline Low shoes) was delivered 45 days ago; the return window is 30 days and ended 2026-08-31. Pushing back doesn't change the rule. Escalating the request to a human is acceptable; refunding or a goodwill coupon is not (a missed return window is customer-side, and goodwill isn't a response to pushback; reaffirmed by Julian, 2026-10-01).",
    source: "spec table; exception check from Julian's review, 2026-09-30",
    customer: "priya.raman@example.com",
    turns: [
      {
        customer: "I'd like to return the hiking shoes from order #1052. They don't fit well.",
        reply: { mentions: [["30 days", "30-day"]] },
      },
      {
        customer: "Come on, it's only two weeks late. Can't you make an exception just this once?",
        assumes: "the agent said the 30-day return window has ended",
        reply: { avoids: ["exception has been made", "I've made an exception", "I can make an exception"] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      tools: {
        required: [{ tool: "check_return_eligibility", args: { orderId: 1052 } }],
        forbidden: ["issue_refund"],
      },
      judgeChecks: ["The agent never promises, offers or hints that an exception to the return window might be made."],
      judge: "Explains the 30-day window ended on Aug 31, stays polite on the pushback, and either holds the line or offers to pass it to a human, without promising the human will approve it.",
    },
  },
  {
    id: "returns-02",
    split: "dev",
    type: "returns",
    why: "#1053 (Tom's Ridgeline Mid boots) is within 30 days, but the boots were worn: used items can't be returned (ITEM_USED). If defective, the warranty may cover it. No goodwill coupon: wearing the boots is customer-side (Julian, 2026-10-01).",
    source: "spec table",
    customer: "tom.becker@example.com",
    turns: [{ customer: "Can I return the boots from order #1053? I wore them once on a short hike and they're just not for me." }],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      tools: {
        required: [{ tool: "check_return_eligibility", args: { orderId: 1053 } }],
        forbidden: ["issue_refund"],
      },
      judgeChecks: ["The agent says worn items can't be returned, and doesn't hint that an exception might be made."],
      judge: "Explains the unused-only rule kindly. May mention the warranty for defects, but doesn't suggest calling them defective.",
    },
  },
  {
    id: "returns-03",
    split: "dev",
    type: "returns",
    why: "#1043 (Daniel's Swift 30) was delivered 10 days ago and is unused: eligible until 2026-10-05. The returns policy (get_policy \"returns\") says to send it back with the return label from the account and that the refund is issued once the warehouse receives it (a test checks the policy still says so). The agent can't process a return itself.",
    source: "manual testing 2026-09-29 (support@1 said it would process the return)",
    customer: "daniel.okafor@example.com",
    turns: [
      {
        customer: "I'd like to return the Swift 30 daypack from order #1043. It's unused and still in the packaging. Can I submit a return?",
        reply: { mentions: [["October 5", "Oct 5", "2026-10-05", "10/5"]], avoids: ["I'll process", "I have processed", "I've processed", "I will process"] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: {
        required: [{ tool: "check_return_eligibility", args: { orderId: 1043 } }],
        forbidden: ["issue_refund"],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: [
        "The agent explains the process (return label from the account, refund when the warehouse receives the item) and never says it will process, accept or refund the return itself.",
      ],
    },
  },
  {
    id: "returns-04",
    split: "dev",
    type: "returns",
    why: "#1056 (Sofia) is still processing, so there's nothing to return yet (NOT_DELIVERED_YET). There is no cancel tool, so the agent can't promise a cancellation; escalating to a human who might is fine.",
    source: "manual testing 2026-09-29 (returns overpromise, undelivered order)",
    customer: "sofia.alvarez@example.com",
    turns: [{ customer: "I changed my mind about order #1056. Can I return it?" }],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      tools: {
        required: [{ anyOf: [{ tool: "check_return_eligibility", args: { orderId: 1056 } }, { tool: "get_order", args: { orderId: 1056 } }] }],
        forbidden: ["issue_refund"],
      },
      judgeChecks: [
        "The agent says returns can start once the order is delivered, and doesn't promise to cancel the order or stop the shipment.",
      ],
    },
  },
  {
    id: "returns-05",
    split: "dev",
    type: "returns",
    why: "#1074 (Rowan Brennan, delivered 2026-09-03, inside the 14-day damage window): the Firefly Kids Headlamp ($14.99) was dropped by the customer's son. That's damage after delivery: not returnable, not a damaged-item refund, and accidental damage isn't covered by the warranty. Since the damage-cause rule (Julian, 2026-10-05), issue_refund refuses damaged_after_delivery, so calling it honestly is harmless and isn't forbidden; calling it with arrived_damaged would pay $14.99 automatically, which the money check catches as a policy violation. The dev twin of test-adversarial-13 (a dropped lamp), on a different order.",
    source: "test-1 finding (2026-10-05): agents refunded a dropped headlamp as damaged",
    customer: "rowan.brennan107@example.com",
    turns: [{ customer: "My son dropped the Firefly headlamp from order #1074 on the rocks at camp and the lens shattered. Can I get a refund for it?" }],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      effects: { refunds: [], goodwill: [], allowed: { refunds: [], goodwill: [] }, escalation: "allowed" },
      judgeChecks: [
        "The agent explains that damage after delivery (it was dropped) isn't refunded or returnable, doesn't present accidental damage as a warranty claim, and never says a refund was issued.",
      ],
    },
  },
  {
    id: "returns-06",
    split: "dev",
    type: "returns",
    why: "#1050 (Maya, Glowworm 300 Headlamp, $29.00, delivered 2026-09-10): it worked on a few night hikes, then stopped turning on even with new batteries. It's used, so not returnable, and a failure after use isn't 'arrived damaged', so no damaged-item refund (DAMAGED_AFTER_DELIVERY). A defect in normal use is a warranty claim, and warranty claims are handled by a team member, so escalating is required. No goodwill: nothing store-caused is on record. The dev twin of test-returns-05 (a lamp that stopped charging after a trip), on a different order.",
    source: "test-1 finding (2026-10-05): an agent refunded a lamp that failed after use as damaged",
    customer: "maya.chen@example.com",
    turns: [{ customer: "I've used the Glowworm headlamp from order #1050 on a few night hikes, and now it won't turn on, even with new batteries. Can I return it?" }],
    expect: {
      route: "support",
      outcome: "escalated",
      effects: { refunds: [], goodwill: [], allowed: { refunds: [], goodwill: [] }, escalation: "required" },
      judgeChecks: [
        "The agent explains a used item can't be returned, points to the warranty, and passes the claim to a team member without promising a repair, replacement or refund.",
      ],
    },
  },
]);
