import { defineCases } from "../../case-schema.ts";

// Test split, batch 4 (drafted 2026-10-02). Never tune prompts on these.

const OUT_OF_STOCK = ["out of stock", "sold out", "not in stock", "not available", "unavailable", "none left"];

export const TEST_STOCK = defineCases([
  {
    id: "test-stock-01",
    split: "test",
    type: "stock",
    why: "Loft Down Jacket M/blue has 7 in stock.",
    source: "test batch 4",
    customer: null,
    turns: [
      {
        customer: "Do you have the Loft Down jacket in medium, blue?",
        reply: { mentions: [["in stock", "7 left", "seven left", "7 available", "seven available", "7 units"]], avoids: OUT_OF_STOCK },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "check_stock", args: { productId: "jacket-loft-down" } }, { tool: "get_product", args: { id: "jacket-loft-down" } }] }],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says the Loft Down Jacket in M, blue is in stock."],
    },
  },
  {
    id: "test-stock-02",
    split: "test",
    type: "stock",
    why: "Scree Trail Runner size 12 orange is out of stock (0); size 12 blue has 2. Any alternative offered must really be in stock.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "Is the Scree Trail Runner available in size 12, orange?", reply: { mentions: [OUT_OF_STOCK] } }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "check_stock", args: { productId: "boot-scree-runner" } }, { tool: "get_product", args: { id: "boot-scree-runner" } }] }],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: ["Any alternative the agent offers (another color, size or product) is in stock according to the tool results."],
      judge: "Says 12/orange is out, offers 12 in blue (only 2 left). No restock date.",
    },
  },
  {
    id: "test-stock-03",
    split: "test",
    type: "stock",
    why: "The Pocket Pro stove has only 3 in stock; the customer wants 4. The answer is 'only 3', not yes and not no.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "I need 4 Pocket Pro stoves for a group trip. Do you have that many?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "check_stock", args: { productId: "stove-pocket-pro" } }, { tool: "get_product", args: { id: "stove-pocket-pro" } }] }],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says only 3 Pocket Pro stoves are in stock, so 4 aren't available."],
      judge: "May suggest the Pocket stove (32 in stock) for the fourth, from the tools.",
    },
  },
  {
    id: "test-stock-04",
    split: "test",
    type: "stock",
    why: "The Willow 1 comes only in green, and that's out of stock (0). The other solo shelter, the Hollow Bivy, is out too. Any alternative offered must be in stock (e.g. the Fernlight 2, 2 left).",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "Can I order the Willow 1 solo tent today?", reply: { mentions: [OUT_OF_STOCK] } }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "check_stock", args: { productId: "tent-willow-1" } }, { tool: "get_product", args: { id: "tent-willow-1" } }] }],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: ["Any alternative the agent offers is in stock according to the tool results, and it gives no restock date."],
    },
  },
  {
    id: "test-stock-05",
    split: "test",
    type: "stock",
    why: "Ridgeline Mid size 10 is out of stock (0); size 9 has 6. The customer then asks the price of a size 9 with SUMMER10: $179.00 less 10% = $161.10, free shipping, from quote_price.",
    source: "test batch 4",
    customer: null,
    turns: [
      { customer: "Do you have the Ridgeline Mid boots in size 10?", reply: { mentions: [OUT_OF_STOCK] } },
      {
        customer: "Hmm. What would a size 9 cost with SUMMER10, then?",
        assumes: "the agent said size 10 is out of stock",
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "check_stock", args: { productId: "boot-ridgeline-mid" } }, { tool: "get_product", args: { id: "boot-ridgeline-mid" } }] }],
      },
      price: { cart: [{ productId: "boot-ridgeline-mid", qty: 1 }], coupon: "SUMMER10", totalCents: 16110, turn: 2 },
      coupon: { code: "SUMMER10", valid: true },
      effects: { escalation: "forbidden" },
    },
  },
]);
