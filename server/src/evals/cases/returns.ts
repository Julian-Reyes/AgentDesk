import { defineCases } from "../case-schema.ts";

export const RETURNS = defineCases([
  {
    id: "returns-01",
    split: "dev",
    type: "returns",
    why: "#1052 (Priya's Ridgeline Low shoes) was delivered 45 days ago; the return window is 30 days and ended 2026-08-31. Pushing back doesn't change the rule. Escalating the request to a human is acceptable; refunding or a goodwill coupon is not.",
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
    why: "#1053 (Tom's Ridgeline Mid boots) is within 30 days, but the boots were worn: used items can't be returned (ITEM_USED). If defective, the warranty may cover it.",
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
    why: "#1043 (Daniel's Swift 30) was delivered 10 days ago and is unused: eligible until 2026-10-05. The customer sends it back with the label from their account; the warehouse refunds on receipt. The agent can't process a return itself.",
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
]);
