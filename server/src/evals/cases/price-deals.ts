import { defineCases } from "../case-schema.ts";

export const PRICE_DEALS = defineCases([
  {
    id: "price-deals-01",
    split: "dev",
    type: "price_deals",
    why: "Two Ridge 2 tents: $498.00 list, the 20% tent sale takes it to $398.40, SUMMER10 takes 10% of that, shipping is free over $75. The total must be quote_price's, not the model's own arithmetic.",
    source: "spec table",
    customer: null,
    turns: [{ customer: "How much would 2 Ridge 2 tents cost with code SUMMER10?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: { cart: [{ productId: "tent-ridge-2", qty: 2 }], coupon: "SUMMER10", totalCents: 35856 },
      coupon: { code: "SUMMER10", valid: true },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "price-deals-02",
    split: "dev",
    type: "price_deals",
    why: "Three Glowworm 300s: $87.00, buy-2-get-1 makes one free ($58.00), which is under the $75 free-shipping threshold, so $7.99 shipping applies: $65.99.",
    customer: null,
    turns: [{ customer: "If I buy 3 Glowworm 300 headlamps, what's my total?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: { cart: [{ productId: "lamp-glowworm-300", qty: 3 }], totalCents: 6599 },
      effects: { escalation: "forbidden" },
      judge: "Explains that one headlamp is free and that shipping is added because the order is under $75.",
    },
  },
  {
    id: "price-deals-03",
    split: "dev",
    type: "price_deals",
    why: "The 15% stove sale ended a month ago, so the Pocket Pro is full price: $55.00 + $7.99 shipping = $62.99.",
    customer: null,
    turns: [
      {
        customer: "Is the stove sale still on? How much would a Pocket Pro stove be, shipped?",
        reply: { mentions: [["ended", "over", "no longer", "not running", "finished", "isn't on", "is not on"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: { cart: [{ productId: "stove-pocket-pro", qty: 1 }], totalCents: 6299 },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says the stove sale has ended and doesn't apply any stove discount."],
    },
  },
  {
    id: "price-deals-04",
    split: "dev",
    type: "price_deals",
    why: "Swift 30 ($119) + Pocket Pro ($55) = $174.00, which meets TRAIL25's $150 minimum: $25 off, free shipping, $149.00.",
    customer: null,
    turns: [{ customer: "What would a Swift 30 Daypack plus a Pocket Pro stove cost with code TRAIL25?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: {
        cart: [
          { productId: "pack-swift-30", qty: 1 },
          { productId: "stove-pocket-pro", qty: 1 },
        ],
        coupon: "TRAIL25",
        totalCents: 14900,
      },
      coupon: { code: "TRAIL25", valid: true },
      effects: { escalation: "forbidden" },
    },
  },
]);
