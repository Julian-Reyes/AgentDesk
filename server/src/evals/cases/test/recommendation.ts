import { defineCases } from "../../case-schema.ts";

// Test split, batch 4 (drafted 2026-10-02). Never tune prompts on these.
// Recommendations stay strict: naming any product outside `acceptable` fails.

export const TEST_RECOMMENDATION = defineCases([
  {
    id: "test-recommendation-01",
    split: "test",
    type: "recommendation",
    why: "Waterproof headlamps under $40 today: Glowworm 300 ($29.00) and Nightowl 200 ($34.00). The Glowworm 150 and Firefly are cheap but not waterproof; the Hearth 350 is waterproof but $44.00.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "I need a waterproof headlamp for under $40. What do you suggest?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      recommendation: {
        constraints: { category: "headlamps", waterproof: true, maxPriceCents: 4000 },
        acceptable: ["lamp-glowworm-300", "lamp-nightowl-200"],
      },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-recommendation-02",
    split: "test",
    type: "recommendation",
    why: "Backpacks at 1 kg or less and under $100: Swift 20 (700 g, $89.00), Rill 12 (500 g, $69.00) and Cub 15 (400 g, $45.00). The Swift 30 (900 g) is $119.00; the Featherline 45 (800 g) is $239.00.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "What's a good backpack that weighs under 1 kg and costs less than $100?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      recommendation: {
        constraints: { category: "backpacks", maxWeightGrams: 1000, maxPriceCents: 10000 },
        acceptable: ["pack-swift-20", "pack-rill-12", "pack-cub-15"],
      },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-recommendation-03",
    split: "test",
    type: "recommendation",
    why: "Tents at 1.5 kg or less that are in stock: only the Fernlight 2 (1200 g, 2 left). Traps: the Willow 1 (1100 g) and Hollow Bivy (600 g) fit the weight but are out of stock.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "I'm a solo backpacker. Which tents under 1.5 kg can I order right now?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      recommendation: {
        constraints: { category: "tents", maxWeightGrams: 1500, inStock: true },
        acceptable: ["tent-fernlight-2"],
      },
      effects: { escalation: "forbidden" },
      judge: "Recommends the Fernlight 2 (a two-person ultralight shelter, $311.20 on sale). Mentioning that the Willow 1 is out of stock is fine; recommending it isn't.",
    },
  },
  {
    id: "test-recommendation-04",
    split: "test",
    type: "recommendation",
    why: "Sleeping bags under 1 kg rated to 0°C or colder: only the Ember 0°C (850 g). The Nightjar quilt (650 g) is rated 2°C; the Ember -10°C is 1150 g.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "I want a sleeping bag that's under 1 kg but still good down to freezing (0°C)." }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      recommendation: {
        constraints: { category: "sleeping_bags", maxWeightGrams: 1000, maxTempRatingC: 0 },
        acceptable: ["bag-ember-0"],
      },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-recommendation-05",
    split: "test",
    type: "recommendation",
    why: "Waterproof jackets under $200, in stock: only the Squall Rain Jacket ($149.00). The Squall Pro ($229.00) and Tundra parka ($329.00) are over budget; the Gale softshell and Breeze shell aren't waterproof.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "Looking for a waterproof jacket under $200. What have you got?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      recommendation: {
        constraints: { category: "jackets", waterproof: true, maxPriceCents: 20000, inStock: true },
        acceptable: ["jacket-squall"],
      },
      effects: { escalation: "forbidden" },
    },
  },
  {
    id: "test-recommendation-06",
    split: "test",
    type: "recommendation",
    why: "Tents for 3+ people under $300 today (20% tent sale): Summit 3 ($263.20) and Basecamp 4 ($223.20). The Meadow 6 is $319.20. At list price the Summit 3 ($329.00) would miss, so the limit must use the sale price.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "We're three people. Which tents fit us for under $300?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      recommendation: {
        constraints: { category: "tents", minCapacityPersons: 3, maxPriceCents: 30000 },
        acceptable: ["tent-summit-3", "tent-basecamp-4"],
      },
      effects: { escalation: "forbidden" },
    },
  },
]);
