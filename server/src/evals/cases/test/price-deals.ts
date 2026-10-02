import { defineCases } from "../../case-schema.ts";

// Test split, batch 4 (drafted 2026-10-02). Never tune prompts on these.
// Every total must come from quote_price and appear in the reply.

export const TEST_PRICE_DEALS = defineCases([
  {
    id: "test-price-deals-01",
    split: "test",
    type: "price_deals",
    why: "Squall Pro ($229.00) + Thicket Fleece ($69.00) = $298.00; GEAR20 takes 20% (jackets aren't excluded, and $298 clears the $50 minimum): $238.40, free shipping.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "What's the total for a Squall Pro jacket and a Thicket fleece with code GEAR20?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: {
        cart: [
          { productId: "jacket-squall-pro", qty: 1 },
          { productId: "jacket-thicket-fleece", qty: 1 },
        ],
        coupon: "GEAR20",
        totalCents: 23840,
      },
      coupon: { code: "GEAR20", valid: true },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-price-deals-02",
    split: "test",
    type: "price_deals",
    why: "Buy-2-get-1 across different headlamps: Beacon 500 ($49.00), Nightowl 200 ($34.00), Firefly Kids ($14.99). The cheapest (Firefly) is free: $83.00, which clears $75, so shipping is free.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "If I get a Beacon 500, a Nightowl 200 and a Firefly kids headlamp, what do I pay?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: {
        cart: [
          { productId: "lamp-beacon-500", qty: 1 },
          { productId: "lamp-nightowl-200", qty: 1 },
          { productId: "lamp-firefly-kids", qty: 1 },
        ],
        totalCents: 8300,
      },
      effects: { escalation: "forbidden" },
      judge: "Explains the cheapest of the three (the Firefly) is free under the headlamp deal.",
    },
  },
  {
    id: "test-price-deals-03",
    split: "test",
    type: "price_deals",
    why: "Cub 15 Kids Pack ($45.00) + Spirit Alcohol Stove ($19.99) = $64.99, under the $75 free-shipping threshold, so $7.99 shipping: $72.98.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "A Cub 15 kids pack and a Spirit alcohol stove: what's the total, and is shipping free?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: {
        cart: [
          { productId: "pack-cub-15", qty: 1 },
          { productId: "stove-spirit-alcohol", qty: 1 },
        ],
        totalCents: 7298,
      },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says shipping isn't free for this order (it's under the free-shipping threshold)."],
    },
  },
  {
    id: "test-price-deals-04",
    split: "test",
    type: "price_deals",
    why: "Basecamp 4 ($279.00 → $223.20 in the tent sale) + Loft Synthetic ($149.00) = $372.20; SUMMER10 takes 10% after the sale: $334.98, free shipping. Order: sale, then coupon.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "How much for a Basecamp 4 tent and a Loft Synthetic jacket with SUMMER10?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: {
        cart: [
          { productId: "tent-basecamp-4", qty: 1 },
          { productId: "jacket-loft-synthetic", qty: 1 },
        ],
        coupon: "SUMMER10",
        totalCents: 33498,
      },
      coupon: { code: "SUMMER10", valid: true },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-price-deals-05",
    split: "test",
    type: "price_deals",
    why: "Boundary: the Canopy 2 is $151.20 in the tent sale, just over TRAIL25's $150 minimum, so $25 off applies: $126.20, free shipping. (At $189.00 list it would clear easily; the point is that the sale price still clears.)",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "Does TRAIL25 work on a Canopy 2 tent? What would I pay?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: { cart: [{ productId: "tent-canopy-2", qty: 1 }], coupon: "TRAIL25", totalCents: 12620 },
      coupon: { code: "TRAIL25", valid: true },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-price-deals-06",
    split: "test",
    type: "price_deals",
    why: "Four Beacon 500s ($196.00 at $49.00 each): buy-2-get-1 frees one per group of three, so one is free, not two: $147.00, free shipping.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "I want 4 Beacon 500 headlamps for my climbing group. How much is that with your headlamp deal?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: { cart: [{ productId: "lamp-beacon-500", qty: 4 }], totalCents: 14700 },
      effects: { escalation: "forbidden" },
      judge: "Explains one of the four is free (one per group of three).",
    },
  },
  {
    id: "test-price-deals-07",
    split: "test",
    type: "price_deals",
    why: "GEAR20 on a mixed cart: tents are excluded, so it applies only to the Squall jacket ($149.00 → $29.80 off); the Creek 2 still gets the tent sale ($103.20). $222.40, free shipping. The code is valid for the cart, just not for every item.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "Creek 2 tent plus a Squall rain jacket with GEAR20: what's my total?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: {
        cart: [
          { productId: "tent-creek-2", qty: 1 },
          { productId: "jacket-squall", qty: 1 },
        ],
        coupon: "GEAR20",
        totalCents: 22240,
      },
      coupon: { code: "GEAR20", valid: true },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says GEAR20 applies to the jacket but not the tent."],
    },
  },
]);
