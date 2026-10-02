import { defineCases } from "../../case-schema.ts";

// Test split, batch 4 (drafted 2026-10-02). Never tune prompts on these.

export const TEST_COMPARISON = defineCases([
  {
    id: "test-comparison-01",
    split: "test",
    type: "comparison",
    why: "Squall ($149.00, 10000 mm, 2.5-layer, 380 g) vs Squall Pro ($229.00, 20000 mm, 3-layer, 420 g). Also a name trap: the grounding checker's aliases must keep 'Squall' and 'Squall Pro' apart.",
    source: "test batch 4",
    customer: null,
    turns: [
      {
        customer: "Squall or Squall Pro rain jacket: what do I get for the extra money?",
        reply: { mentions: [["10000 mm", "10,000 mm", "10000mm", "10,000mm", "10k mm"], ["20000 mm", "20,000 mm", "20000mm", "20,000mm", "20k mm"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judge: "Waterproofing (10000 vs 20000 mm) and construction (2.5- vs 3-layer) are the differences; weight is close. Prices from the tools.",
    },
  },
  {
    id: "test-comparison-02",
    split: "test",
    type: "comparison",
    why: "Loft Down (800-fill down, 350 g, $199.00) vs Loft Synthetic (synthetic insulation, 400 g, $149.00, 'keeps insulating when wet'). For wet weather the synthetic is the better pick; the down is lighter.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "Loft Down or Loft Synthetic jacket for wet, cold weather in the Pacific Northwest?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says the Loft Synthetic keeps insulating when wet, which suits wet weather, and that the Loft Down is the lighter of the two."],
      judge: "Neither jacket is waterproof; may suggest a rain shell on top. No invented warmth ratings.",
    },
  },
  {
    id: "test-comparison-03",
    split: "test",
    type: "comparison",
    why: "Beacon 500 (500 lumens, 1200 min = 20 h, USB-C rechargeable, $49.00) vs Glowworm 300 (300 lumens, 1800 min = 30 h, AAA, $29.00). The brighter lamp has the shorter burn time; a reasoning check on two specs pulling apart.",
    source: "test batch 4",
    customer: null,
    turns: [
      {
        customer: "Beacon 500 vs Glowworm 300 headlamp: which is brighter, and which lasts longer on a charge or set of batteries?",
        reply: { mentions: [["500 lumens", "500 lm", "500-lumen"], ["300 lumens", "300 lm", "300-lumen"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says the Beacon 500 is brighter and the Glowworm 300 runs longer (30 hours vs 20 hours, or 1800 vs 1200 minutes)."],
    },
  },
  {
    id: "test-comparison-04",
    split: "test",
    type: "comparison",
    why: "Traverse 50 (50 L, 1800 g, $219.00) vs Traverse 65 (65 L, 2100 g, $259.00) for a 3-night trip.",
    source: "test batch 4",
    customer: null,
    turns: [
      {
        customer: "For a three-night backpacking trip, should I get the Traverse 50 or the Traverse 65?",
        reply: { mentions: [["1.8 kg", "1.8kg", "1800 g", "1800g", "1,800 g"], ["2.1 kg", "2.1kg", "2100 g", "2100g", "2,100 g"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judge: "Compares volume (50 vs 65 L), weight and price; the 50 is the catalog's 'weekend trips and lighter loads' pack, the 65 is for multi-day trips. No invented load ratings.",
    },
  },
  {
    id: "test-comparison-05",
    split: "test",
    type: "comparison",
    why: "Frostline Winter Boot (insulated, rated to -30°C, waterproof, 1600 g) vs Ridgeline Mid (waterproof, 1200 g, no temperature rating in the catalog). A grounding trap: the agent mustn't invent a temperature rating for the Ridgeline Mid.",
    source: "test batch 4",
    customer: null,
    turns: [{ customer: "For snowshoeing in deep snow, Frostline winter boots or Ridgeline Mid hiking boots? How cold can each handle?" }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judgeChecks: [
        "The agent gives the Frostline's -30°C rating and doesn't state a temperature rating for the Ridgeline Mid (the catalog has none).",
      ],
    },
  },
]);
