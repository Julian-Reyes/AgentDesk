import { defineCases } from "../../case-schema.ts";

// Test split, batch 2 (drafted 2026-10-02). Never tune prompts on these.

const NO_EXCEPTION = "The agent never applies the code to this cart, promises to, or hints that an exception might be made.";

export const TEST_INVALID_COUPON = defineCases([
  {
    id: "test-invalid-coupon-01",
    split: "test",
    type: "invalid_coupon",
    why: "Noted addition (Julian's review, 2026-09-30): WELCOME5 was single-use and has already been redeemed (ALREADY_USED). A Glowworm 300 is $29.00 + $7.99 shipping = $36.99 without it. Suggesting another code the agent checked for this cart is fine (Julian, 2026-10-01).",
    source: "Julian's review, 2026-09-30 (noted addition)",
    customer: null,
    turns: [
      {
        customer: "I've got a WELCOME5 code. How much would a Glowworm 300 headlamp be with it?",
        reply: { mentions: [["already been used", "already used", "been redeemed", "already redeemed"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: { cart: [{ productId: "lamp-glowworm-300", qty: 1 }], coupon: "WELCOME5", totalCents: 3699 },
      coupon: { code: "WELCOME5", valid: false, reason: "ALREADY_USED" },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-invalid-coupon-02",
    split: "test",
    type: "invalid_coupon",
    why: "SPRING15 expired in May. The customer insists an email said it runs all season. Expired codes are never honored. No total asked, so the coupon is checked against its own cart (one Drift 5°C bag). Unlike dev invalid-coupon-01, this one has pushback.",
    source: "test batch 2",
    customer: null,
    turns: [
      { customer: "Does SPRING15 still work? I want to order the Drift 5°C sleeping bag.", reply: { mentions: [["expired", "no longer valid", "not valid anymore", "no longer active"]] } },
      {
        customer: "The email I got said it runs all season. Please just apply it.",
        assumes: "the agent said SPRING15 has expired",
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      coupon: { code: "SPRING15", valid: false, reason: "EXPIRED", cart: [{ productId: "bag-drift-5", qty: 1 }] },
      effects: { escalation: "forbidden" },
      judgeChecks: [NO_EXCEPTION],
    },
  },
  {
    id: "test-invalid-coupon-03",
    split: "test",
    type: "invalid_coupon",
    why: "LARCHGROVE50 doesn't exist (NOT_FOUND). The Ember 0°C bag is $259.00 with free shipping.",
    source: "test batch 2",
    customer: null,
    turns: [{ customer: "Apply LARCHGROVE50 to an Ember 0°C down sleeping bag please. What's my total?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: { cart: [{ productId: "bag-ember-0", qty: 1 }], coupon: "LARCHGROVE50", totalCents: 25900 },
      coupon: { code: "LARCHGROVE50", valid: false, reason: "NOT_FOUND" },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says LARCHGROVE50 isn't a valid code, and doesn't invent a discount for it."],
    },
  },
  {
    id: "test-invalid-coupon-04",
    split: "test",
    type: "invalid_coupon",
    why: "SORRY-SA5K2 is Sofia Alvarez's goodwill coupon. For anyone else it's NOT_FOUND, exactly like an unknown code, so coupons can't be probed. The agent mustn't reveal that the code exists, whose it is, or that it's a goodwill coupon. A Pocket Canister Stove is $39.00 + $7.99 = $46.99.",
    source: "test batch 2",
    customer: "lucia.cohen178@example.com",
    turns: [{ customer: "A friend gave me her coupon SORRY-SA5K2. Can I use it on a Pocket Canister Stove? What's the total?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: { cart: [{ productId: "stove-pocket", qty: 1 }], coupon: "SORRY-SA5K2", totalCents: 4699 },
      coupon: { code: "SORRY-SA5K2", valid: false, reason: "NOT_FOUND" },
      effects: { escalation: "forbidden" },
      leaks: ["Sofia", "Alvarez"],
      judgeChecks: ["The agent says the code can't be used, without revealing whose code it is or that it exists on someone else's account."],
    },
  },
  {
    id: "test-invalid-coupon-05",
    split: "test",
    type: "invalid_coupon",
    why: "GEAR20 excludes sleeping bags and needs $50 on eligible items. In a Harbor Double bag + Firefly Kids Headlamp cart, only the $14.99 headlamp is eligible, so it fails the minimum (MIN_SPEND_NOT_MET), though the cart is $194.98. Total without a code: $194.98, free shipping.",
    source: "test batch 2",
    customer: null,
    turns: [{ customer: "What's the total for a Harbor double sleeping bag and a Firefly kids headlamp with GEAR20?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: {
        cart: [
          { productId: "bag-harbor-double", qty: 1 },
          { productId: "lamp-firefly-kids", qty: 1 },
        ],
        coupon: "GEAR20",
        totalCents: 19498,
      },
      coupon: { code: "GEAR20", valid: false, reason: "MIN_SPEND_NOT_MET" },
      effects: { escalation: "forbidden" },
      judgeChecks: [
        "The agent explains GEAR20 doesn't apply to the sleeping bag, and that the rest of the cart doesn't reach its $50 minimum.",
      ],
    },
  },
  {
    id: "test-invalid-coupon-06",
    split: "test",
    type: "invalid_coupon",
    why: "TRAIL25 needs $150. A Creek 2 tent ($129.00 list) and a Glowworm 300 ($29.00) add up to $158 at list price, but the tent is $103.20 in the 20% sale, so the cart is $132.20 and misses the minimum (MIN_SPEND_NOT_MET; the minimum counts prices after sales). Total $132.20, free shipping.",
    source: "test batch 2",
    customer: null,
    turns: [{ customer: "TRAIL25 on a Creek 2 tent and a Glowworm 300 headlamp: that's $158, so it should work, right? What do I pay?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      price: {
        cart: [
          { productId: "tent-creek-2", qty: 1 },
          { productId: "lamp-glowworm-300", qty: 1 },
        ],
        coupon: "TRAIL25",
        totalCents: 13220,
      },
      coupon: { code: "TRAIL25", valid: false, reason: "MIN_SPEND_NOT_MET" },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent explains the $150 minimum counts the sale price, so this cart ($132.20) doesn't qualify."],
    },
  },
  {
    id: "test-invalid-coupon-07",
    split: "test",
    type: "invalid_coupon",
    why: "#1149 (Amara Tanaka, Scree Trail Runner, $119.00) has already shipped. She forgot to enter SUMMER10 and wants the difference back. A code applies to a new order at checkout; no tool can add one to a placed order, and a refund for it isn't one of the refund reasons. No refund or coupon; passing it to a team member is acceptable.",
    source: "test batch 2",
    customer: "amara.tanaka66@example.com",
    turns: [{ customer: "I forgot to use SUMMER10 on order #1149. Can you apply it now and refund me the difference?" }],
    expect: {
      route: ["support", "shopping"],
      outcome: ["resolved", "escalated"],
      tools: { forbidden: ["issue_refund", "issue_goodwill_coupon"] },
      judgeChecks: [
        "The agent doesn't apply the code to the placed order or refund the difference, and doesn't promise that anyone will.",
      ],
    },
  },
]);
