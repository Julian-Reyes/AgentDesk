import { defineCases } from "../case-schema.ts";

export const INVALID_COUPON = defineCases([
  {
    id: "invalid-coupon-01",
    split: "dev",
    type: "invalid_coupon",
    why: "SPRING15 expired in June. The Swift 20 stays at $89.00 with free shipping (over $75). The agent may instead suggest a current code it checked for this cart (e.g. GEAR20) and give that total from quote_price (Julian, 2026-10-01).",
    source: "spec table",
    customer: null,
    turns: [
      {
        customer: "Can I use code SPRING15 on a Swift 20 Daypack? What would I pay?",
        reply: { mentions: [["expired", "no longer valid", "not valid anymore", "no longer active"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: { cart: [{ productId: "pack-swift-20", qty: 1 }], coupon: "SPRING15", totalCents: 8900 },
      coupon: { code: "SPRING15", valid: false, reason: "EXPIRED" },
      effects: { escalation: "forbidden" },
      judge: "Says SPRING15 has expired. Gives the price without a coupon ($89.00), or suggests a current code it checked for this cart, with that code's real terms and total.",
    },
  },
  {
    id: "invalid-coupon-02",
    split: "dev",
    type: "invalid_coupon",
    why: "GEAR20 excludes tents and sleeping bags. The Canopy 2 still gets the automatic tent sale: $151.20, free shipping.",
    source: "spec table",
    customer: null,
    turns: [{ customer: "I want the Canopy 2 tent with code GEAR20. What's the total?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: { cart: [{ productId: "tent-canopy-2", qty: 1 }], coupon: "GEAR20", totalCents: 15120 },
      coupon: { code: "GEAR20", valid: false, reason: "CATEGORY_EXCLUDED" },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent explains that GEAR20 doesn't apply to tents."],
    },
  },
  {
    id: "invalid-coupon-03",
    split: "dev",
    type: "invalid_coupon",
    why: "TRAIL25 needs a $150 minimum; a Swift 20 is $89.00. Insisting doesn't change the rule. No price asked for, so the coupon is checked against its own cart.",
    customer: null,
    turns: [
      { customer: "Can you apply TRAIL25 to a Swift 20 Daypack?", reply: { amounts: [15000] } },
      {
        customer: "Just apply it anyway, I've shopped with you for years.",
        assumes: "the agent said TRAIL25 needs a $150 minimum spend",
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      coupon: { code: "TRAIL25", valid: false, reason: "MIN_SPEND_NOT_MET", cart: [{ productId: "pack-swift-20", qty: 1 }] },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent never applies TRAIL25 to this cart, promises to, or hints that an exception might be made."],
      judge: "Stays friendly on the pushback. May suggest adding items to reach $150, as long as any prices come from the tools.",
    },
  },
]);
