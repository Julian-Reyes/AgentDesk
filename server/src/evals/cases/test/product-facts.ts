import { defineCases } from "../../case-schema.ts";

// Test split, batch 4 (drafted 2026-10-02). Never tune prompts on these.

export const TEST_PRODUCT_FACTS = defineCases([
  {
    id: "test-product-facts-01",
    split: "test",
    type: "product_facts",
    why: "Tundra 2 Four-Season Tent: 4 seasons, 5000 mm waterproof rating (catalog). Both facts asked; both must be right.",
    source: "test batch 4",
    customer: null,
    turns: [
      {
        customer: "Is the Tundra 2 tent OK for winter camping? How many seasons is it rated for, and what's the waterproof rating?",
        reply: { mentions: [["4-season", "four-season", "4 season", "four season", "4 seasons", "four seasons"], ["5000 mm", "5,000 mm", "5000mm", "5,000mm"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judge: "Yes: a 4-season tent built for snow load and high winds, 5000 mm. May add 2 people, 3.3 kg and the sale price ($439.20).",
    },
  },
  {
    id: "test-product-facts-02",
    split: "test",
    type: "product_facts",
    why: "Squall Pro Rain Jacket: 20000 mm waterproof rating, 420 g, 3-layer nylon (catalog).",
    source: "test batch 4",
    customer: null,
    turns: [
      {
        customer: "How waterproof is the Squall Pro jacket, and what does it weigh?",
        reply: { mentions: [["20000 mm", "20,000 mm", "20000mm", "20,000mm", "20k mm"], ["420 g", "420g", "0.42 kg"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-product-facts-03",
    split: "test",
    type: "product_facts",
    why: "A missing fact with a trap: the catalog says the Ember bags use 'responsibly sourced down', but says nothing about the Loft Down Jacket's down beyond '800-fill'. The agent must not carry the Ember's claim over or guess.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "Is the down in the Loft Down Jacket responsibly sourced?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      judgeChecks: [
        "The agent doesn't state as a fact whether the Loft Down Jacket's down is responsibly sourced (the catalog doesn't say); it says it doesn't have that information.",
      ],
      judge: "May share what it does know: 800-fill down, 350 g, $199.00.",
    },
  },
  {
    id: "test-product-facts-04",
    split: "test",
    type: "product_facts",
    why: "The Breeze Wind Shell is not waterproof (catalog: waterproof false; a 1500 mm rating, a featherweight wind shell). Asked whether it's enough for rain, the right answer is no; the waterproof Squall is a fair suggestion.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "Is the Breeze Wind Shell waterproof enough to wear in the rain?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says the Breeze Wind Shell isn't waterproof (it's a wind shell), and doesn't present it as a rain jacket."],
    },
  },
  {
    id: "test-product-facts-05",
    split: "test",
    type: "product_facts",
    why: "Nomad Multi-Fuel Stove: burns white gas, kerosene or canister fuel; 330 g (catalog).",
    source: "test batch 4",
    customer: null,
    turns: [
      {
        customer: "What fuels can the Nomad stove burn, and how heavy is it?",
        reply: { mentions: ["white gas", "kerosene", ["330 g", "330g", "0.33 kg"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judge: "Lists all three fuels (white gas, kerosene, canister) and 330 g. No invented boil times or output.",
    },
  },
]);
