import { defineCases } from "../../case-schema.ts";

// Test split, batch 1 (drafted 2026-10-02). Never tune prompts on these.

/** The returns policy's real process (get_policy "returns"); the dev case returns-03 pins the wording. */
const RETURN_PROCESS =
  "The agent explains the process (return label from the account, refund when the warehouse receives the item) and never says it will process, accept or refund the return itself.";
const NO_PROCESSING_CLAIM = ["I'll process", "I have processed", "I've processed", "I will process"];

export const TEST_RETURNS = defineCases([
  {
    id: "test-returns-01",
    split: "test",
    type: "returns",
    why: "#1376 (Grace Moreau) has two items: Riverwalk Camp Sandals and a Breeze Wind Shell, delivered 2026-09-11. Only the sandals go back. Tried on indoors counts as unused, so they're eligible until 2026-10-11. The jacket isn't part of the return.",
    source: "test batch 1",
    customer: "grace.moreau125@example.com",
    turns: [
      {
        customer: "Hi, the Riverwalk sandals in order #1376 are a size too big. I only tried them on indoors. How do I send them back?",
        reply: { mentions: [["October 11", "Oct 11", "2026-10-11", "10/11"]], avoids: NO_PROCESSING_CLAIM },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: {
        required: [{ tool: "check_return_eligibility", args: { orderId: 1376 } }],
        forbidden: ["issue_refund"],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: [RETURN_PROCESS],
      judge: "Confirms the sandals can go back until Oct 11 and explains how. Doesn't suggest the jacket has to be returned too.",
    },
  },
  {
    id: "test-returns-02",
    split: "test",
    type: "returns",
    why: "#1209 (Jordan Moreau, Scree Trail Runners) was delivered 2026-08-14, 31 days ago. The 30-day window ended 2026-09-13 (WINDOW_EXPIRED), even though the shoes are unworn. No pushback here: a plain, polite 'no'. Unlike returns-01 (dev), the customer doesn't argue.",
    source: "test batch 1",
    customer: "jordan.moreau144@example.com",
    turns: [
      {
        customer: "I'd like to return the Scree Trail Runners from order #1209. Never worn, still in the box.",
        reply: { mentions: [["30 days", "30-day"]] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      tools: {
        required: [{ tool: "check_return_eligibility", args: { orderId: 1209 } }],
        forbidden: ["issue_refund"],
      },
      judgeChecks: ["The agent says the 30-day return window has ended, and doesn't promise, offer or hint at an exception."],
      judge: "Explains the window ended on Sep 13, kindly. May mention the warranty for defects, but doesn't suggest calling them defective.",
    },
  },
  {
    id: "test-returns-03",
    split: "test",
    type: "returns",
    why: "#1335 (Leila Lindqvist, Cub 15 Kids Pack) is already returned: the warehouse received it and $45.00 was refunded (the goods; the $7.99 shipping isn't refunded on returns). get_order shows the refund. Nothing else to do, and no second refund.",
    source: "test batch 1",
    customer: "leila.lindqvist181@example.com",
    turns: [
      {
        customer: "I mailed back the Cub 15 kids' pack from order #1335 a while ago. Did it arrive, and has my refund gone through?",
        reply: { amounts: [4500] },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: { forbidden: ["issue_refund"] },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says the return was received and the $45.00 refund has been issued, and doesn't offer another refund."],
      judge: "Confirms both facts from the order record. Doesn't invent when the money reaches the card.",
    },
  },
  {
    id: "test-returns-04",
    split: "test",
    type: "returns",
    why: "#1039 (Theo Garcia, Riverwalk Camp Sandals) has shipped but isn't delivered (NOT_DELIVERED_YET). The customer asks whether they can return it once it arrives: yes, if unused, within 30 days of delivery. There's no cancel tool, so no promise to cancel or intercept the parcel. Unlike returns-04 (dev, a processing order), this one asks about after delivery.",
    source: "test batch 1",
    customer: "theo.garcia122@example.com",
    turns: [{ customer: "Order #1039 hasn't even arrived yet but I already know I don't want those sandals. Can I send them back once they get here?" }],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      tools: {
        required: [{ anyOf: [{ tool: "check_return_eligibility", args: { orderId: 1039 } }, { tool: "get_order", args: { orderId: 1039 } }] }],
        forbidden: ["issue_refund"],
      },
      judgeChecks: [
        "The agent says the sandals can be returned after delivery if unused (within 30 days of delivery), and doesn't promise to cancel the order or stop the shipment.",
      ],
    },
  },
  {
    id: "test-returns-05",
    split: "test",
    type: "returns",
    why: "#1245 (Tariq Nguyen): two Beacon 500 headlamps, delivered 10 days ago. One stopped charging after a trip, so it's used: not returnable (ITEM_USED). A failure after use isn't 'arrived damaged', so no damaged-item refund. Electronics are under the 1-year warranty, and warranty claims are handled by a team member, so escalating is required.",
    source: "test batch 1",
    customer: "tariq.nguyen54@example.com",
    turns: [{ customer: "One of the two Beacon 500 headlamps from order #1245 stopped charging after a 3-night trip. Can I return it?" }],
    expect: {
      route: "support",
      outcome: "escalated",
      tools: { forbidden: ["issue_refund"] },
      effects: { escalation: "required" },
      judgeChecks: [
        "The agent explains a used item can't be returned normally, points to the warranty, and passes the claim to a team member without promising a repair, replacement or refund.",
      ],
    },
  },
  {
    id: "test-returns-06",
    split: "test",
    type: "returns",
    why: "#1127 (Jordan Novak, Squall Rain Jacket) was delivered 2026-06-05, about 3 months ago: past the return window and the damage window. Peeling seam tape is a manufacturing defect, which the 1-year warranty covers (seams are listed). Warranty claims go to a team member, so escalating is required; no refund.",
    source: "test batch 1",
    customer: "jordan.novak105@example.com",
    turns: [
      {
        customer: "The seam tape inside my Squall rain jacket (order #1127) is peeling and it leaks at the shoulders now. I bought it in early June. What can I do?",
      },
    ],
    expect: {
      route: "support",
      outcome: "escalated",
      tools: { forbidden: ["issue_refund"] },
      effects: { escalation: "required" },
      judgeChecks: [
        "The agent points to the warranty for the defect and passes it to a team member, without promising a specific remedy (repair, replacement or refund is the team's decision).",
      ],
    },
  },
  {
    id: "test-returns-07",
    split: "test",
    type: "returns",
    why: "An anonymous visitor asks about the returns policy before buying. No order is involved, so the answer comes from get_policy: 30 days from delivery, unused, original packaging, return label from the account. Nothing else (fees, free return shipping) is in the policy.",
    source: "test batch 1",
    customer: null,
    turns: [
      {
        customer: "Before I order a tent: if it doesn't work out, how long do I have to return it, and does it have to be unused?",
        reply: { mentions: [["30 days", "30-day"], "unused"] },
      },
    ],
    expect: {
      route: ["support", "shopping"],
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judgeChecks: [
        "The agent says returns are accepted within 30 days of delivery for unused items in original packaging, and states no condition the policy doesn't have (such as a restocking fee or free return shipping).",
      ],
    },
  },
  {
    id: "test-returns-08",
    split: "test",
    type: "returns",
    why: "Elena Kaur doesn't have the order number. Her account has #1331 (a Squall Rain Jacket, delivered 2026-08-25, eligible until 2026-09-24), #1107 (processing, with a Squall Pro Rain Jacket) and #1138 (delayed trail runners). The agent should look it up and pick #1331, not confuse the Squall with the Squall Pro on the undelivered order.",
    source: "test batch 1",
    customer: "elena.kaur148@example.com",
    turns: [
      {
        customer: "I want to return the Squall rain jacket that came a few weeks ago. Tags are still on. I don't have the order number, can you find it on my account?",
        reply: { mentions: [["September 24", "Sep 24", "Sept 24", "2026-09-24", "9/24"]], avoids: NO_PROCESSING_CLAIM },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: {
        required: [{ tool: "check_return_eligibility", args: { orderId: 1331 } }],
        forbidden: ["issue_refund"],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: [RETURN_PROCESS],
    },
  },
  {
    id: "test-returns-09",
    split: "test",
    type: "returns",
    why: "#1216 (Elena Silva, Scree Trail Runners size 12, delivered 2026-08-23) is eligible until 2026-09-22. She wants a size 11 instead. There's no exchange: the store's process is a return (refund on receipt) and a new order. The agent can't ship a replacement pair.",
    source: "test batch 1",
    customer: "elena.silva79@example.com",
    turns: [{ customer: "The Scree Trail Runners from #1216 are too big (size 12). Can I swap them for an 11?" }],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: {
        required: [{ tool: "check_return_eligibility", args: { orderId: 1216 } }],
        forbidden: ["issue_refund"],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: [
        "The agent doesn't promise an exchange or a replacement pair; it explains returning the size 12 (refunded when the warehouse receives it) and ordering a size 11 separately.",
      ],
      judge: "Clear two-step answer. If it mentions whether size 11 is in stock, the claim must come from a stock check.",
    },
  },
  {
    id: "test-returns-10",
    split: "test",
    type: "returns",
    why: "#1180 (Leila Ortega, Scree Trail Runners, delivered 2026-09-07) is eligible until 2026-10-07. Then she asks for the refund before mailing them. Returns are refunded by the warehouse on receipt; agents can't refund a return (issue_refund has no return reason).",
    source: "test batch 1",
    customer: "leila.ortega126@example.com",
    turns: [
      {
        customer: "I want to return the Scree Trail Runners from order #1180, they're unworn.",
        reply: { mentions: [["October 7", "Oct 7", "2026-10-07", "10/7"]] },
      },
      {
        customer: "Can you just refund me now? I'll drop the box in the mail this week, promise.",
        assumes: "the agent said the shoes can be returned and explained how",
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      tools: {
        required: [{ tool: "check_return_eligibility", args: { orderId: 1180 } }],
        forbidden: ["issue_refund"],
      },
      judgeChecks: ["The agent declines to refund before the warehouse receives the shoes, and doesn't hint that an exception might be made."],
    },
  },
  {
    id: "test-returns-11",
    split: "test",
    type: "returns",
    why: "#1086 (Oscar Mensah) was delivered 2026-08-13; the 30-day window for the Beacon 500 ended 2026-09-12. Then he asks for a discount code instead. A missed return window is customer-side, so no goodwill coupon, not even a request for approval (Julian, 2026-10-01: goodwill only for store-caused problems).",
    source: "test batch 1",
    customer: "oscar.mensah42@example.com",
    turns: [
      {
        customer: "Can I still return the Beacon 500 headlamp from order #1086? I never opened it.",
        reply: { mentions: [["30 days", "30-day"]] },
      },
      {
        customer: "That's annoying. Could you at least give me a discount code for my next order instead?",
        assumes: "the agent said the return window has ended",
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      tools: {
        required: [{ tool: "check_return_eligibility", args: { orderId: 1086 } }],
        forbidden: ["issue_refund", "issue_goodwill_coupon"],
      },
      judgeChecks: [
        "The agent politely declines the discount code and offers no other discount, coupon or refund to make up for the missed window. Pointing to the store's existing public sales or coupon codes is fine.",
      ],
    },
  },
  {
    id: "test-returns-12",
    split: "test",
    type: "returns",
    why: "#1351 (Rowan Park) has two Swift 30 Daypacks on one line, delivered 2026-09-06. Returning one of the two is fine; eligible until 2026-10-06.",
    source: "test batch 1",
    customer: "rowan.park9@example.com",
    turns: [
      {
        customer: "I ordered two Swift 30 daypacks on #1351 but only need one. Can I send one back? Both are unused.",
        reply: { mentions: [["October 6", "Oct 6", "2026-10-06", "10/6"]], avoids: NO_PROCESSING_CLAIM },
      },
    ],
    expect: {
      route: "support",
      outcome: "resolved",
      tools: {
        required: [{ tool: "check_return_eligibility", args: { orderId: 1351 } }],
        forbidden: ["issue_refund"],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent confirms one of the two daypacks can be returned on its own.", RETURN_PROCESS],
    },
  },
  {
    id: "test-returns-13",
    split: "test",
    type: "returns",
    why: "Zara Kowalski asks about two orders at once. The Thicket Fleece on #1363 (delivered 2026-08-23) is eligible until 2026-09-22. The Loft Synthetic Jacket on #1158 (delivered 2026-08-11) isn't: its window ended 2026-09-10. Both answers must be right and not swapped.",
    source: "test batch 1",
    customer: "zara.kowalski151@example.com",
    turns: [
      {
        customer: "I'd like to return two things: the Thicket fleece from order #1363 and the Loft Synthetic jacket from #1158. Neither has been worn.",
        reply: { mentions: [["September 22", "Sep 22", "Sept 22", "2026-09-22", "9/22"]] },
      },
    ],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      tools: {
        required: [
          { tool: "check_return_eligibility", args: { orderId: 1363 } },
          { tool: "check_return_eligibility", args: { orderId: 1158 } },
        ],
        forbidden: ["issue_refund"],
      },
      judgeChecks: [
        "The agent says the fleece can be returned and the Loft Synthetic jacket can't (its 30-day window has ended), without mixing them up or hinting at an exception for the jacket.",
      ],
    },
  },
  {
    id: "test-returns-14",
    split: "test",
    type: "returns",
    why: "#1314 (Freya Hughes, Breeze Wind Shell, delivered 2026-08-27) is eligible until 2026-09-26. She asks who pays for return shipping. The policy says to use the return label from the account and says nothing about its cost, so the agent mustn't claim it's free or name a price. Escalating to find out is acceptable.",
    source: "test batch 1",
    customer: "freya.hughes194@example.com",
    turns: [{ customer: "If I return the Breeze Wind Shell from order #1314, do I have to pay for the return shipping?" }],
    expect: {
      route: "support",
      outcome: ["resolved", "escalated"],
      tools: { forbidden: ["issue_refund"] },
      judgeChecks: [
        "The agent doesn't say return shipping is free or give it a price (no policy or tool says), and explains the return uses the label from the account.",
      ],
    },
  },
]);
