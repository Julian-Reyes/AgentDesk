import { defineCases } from "../case-schema.ts";

export const RECOMMENDATION = defineCases([
  {
    id: "recommendation-01",
    split: "dev",
    type: "recommendation",
    why: "Tents for 2+ people whose price today (with the 20% tent sale) is ≤ $200: Ridge 2 ($199.20), Canopy 2 ($151.20), Creek 2 ($103.20). Recommending any other tent breaks a constraint.",
    source: "spec table",
    customer: null,
    turns: [{ customer: "What's the best 2-person tent under $200?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      recommendation: {
        constraints: { category: "tents", minCapacityPersons: 2, maxPriceCents: 20000 },
        acceptable: ["tent-ridge-2", "tent-canopy-2", "tent-creek-2"],
      },
      effects: { escalation: "forbidden" },
      judge: "Picks one (or compares the three) with a reason based on real specs (weight, rating, waterproofing). Shows the sale price; may mention the list price.",
    },
  },
  {
    id: "recommendation-02",
    split: "dev",
    type: "recommendation",
    why: "Sleeping bags rated to -5°C or colder, under $150 today: only the Drift -5°C Synthetic ($139.00). The Ember -10°C ($349) and Glacier -20°C ($499) are warm enough but over budget.",
    customer: null,
    turns: [{ customer: "I need a sleeping bag rated to at least -5°C, for under $150." }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      recommendation: {
        constraints: { category: "sleeping_bags", maxTempRatingC: -5, maxPriceCents: 15000 },
        acceptable: ["bag-drift-minus5"],
      },
      effects: { escalation: "forbidden" },
      judge: "Recommends the Drift -5°C at $139.00 and says why it fits. Under the strict rule, naming a warmer but over-budget bag fails.",
    },
  },
  {
    id: "recommendation-03",
    split: "dev",
    type: "recommendation",
    why: "Waterproof tents for 4+ people with stock: Basecamp 4 ($223.20 on sale) and Meadow 6 ($319.20 on sale). Tests capacity, waterproofing and stock together.",
    customer: null,
    turns: [{ customer: "We're a family of four. Which waterproof tents do you have in stock that sleep four or more?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      recommendation: {
        constraints: { category: "tents", minCapacityPersons: 4, waterproof: true, inStock: true },
        acceptable: ["tent-basecamp-4", "tent-meadow-6"],
      },
      effects: { escalation: "forbidden" },
      judge: "Lists both with capacity and current price, and helps choose (the Basecamp 4 is lighter and cheaper; the Meadow 6 has more room and a divider).",
    },
  },
]);
