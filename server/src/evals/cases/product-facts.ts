import { defineCases } from "../case-schema.ts";

export const PRODUCT_FACTS = defineCases([
  {
    id: "product-facts-01",
    split: "dev",
    type: "product_facts",
    why: "Ridge 2 Backpacking Tent: waterproof, 3000 mm rating, 1900 g. Both facts come straight from the catalog.",
    source: "spec table",
    customer: null,
    turns: [
      {
        customer: "Is the Ridge 2 tent waterproof? And how much does it weigh?",
        reply: { mentions: ["waterproof", ["1.9 kg", "1.9kg", "1900 g", "1900g", "1,900 g", "4.2 lb"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      tools: { required: [{ anyOf: [{ tool: "get_product", args: { id: "tent-ridge-2" } }, { tool: "search_products" }] }] },
      effects: { escalation: "forbidden" },
      judge: "Answers both questions directly: yes, waterproof (3000 mm), and 1.9 kg. May add the sale price. Short.",
    },
  },
  {
    id: "product-facts-02",
    split: "dev",
    type: "product_facts",
    why: "Beacon 900 Rechargeable Headlamp: 900 lumens, 900 minutes (15 hours) of burn time. Tests that the agent converts or quotes the burn time correctly.",
    customer: null,
    turns: [
      {
        customer: "How bright is the Beacon 900 headlamp, and how long does the battery last?",
        reply: {
          mentions: [
            ["900 lumens", "900 lm", "900-lumen"],
            ["15 hours", "15 h", "15-hour", "900 minutes"],
          ],
        },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judge: "Gives 900 lumens and 15 hours (900 minutes). Doesn't invent a charge time or battery capacity; the catalog has neither.",
    },
  },
  {
    id: "product-facts-03",
    split: "dev",
    type: "product_facts",
    why: "The catalog doesn't say whether the Willow 1 comes with a footprint. The right answer is 'I don't have that information', not a guess either way. A grounding test for facts that aren't there.",
    customer: null,
    turns: [{ customer: "Does the Willow 1 tent come with a footprint?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      judgeChecks: [
        "The agent does not state as a fact whether the Willow 1 includes a footprint (the catalog doesn't say); it says it doesn't have that information.",
      ],
      judge: "Says the product details don't mention a footprint, and may share what it does know (1 person, 1.1 kg, waterproof).",
    },
  },
]);
