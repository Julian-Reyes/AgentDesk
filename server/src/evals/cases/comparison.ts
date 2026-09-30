import { defineCases } from "../case-schema.ts";

export const COMPARISON = defineCases([
  {
    id: "comparison-01",
    split: "dev",
    type: "comparison",
    why: "Ridge 2 (2 people, 1900 g, $199.20 on sale) vs Summit 3 (3 people, 2600 g, $263.20 on sale). For backpacking, weight is the key difference.",
    source: "spec table",
    customer: null,
    turns: [
      {
        customer: "Ridge 2 vs Summit 3 for backpacking, which one should I get?",
        reply: {
          mentions: [
            ["1.9 kg", "1.9kg", "1900 g", "1900g", "1,900 g"],
            ["2.6 kg", "2.6kg", "2600 g", "2600g", "2,600 g"],
          ],
        },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judge: "Correct specs for both (capacity, weight). Points out the Ridge 2 is lighter for two people and the Summit 3 roomier for three. Any prices quoted are the current sale prices.",
    },
  },
  {
    id: "comparison-02",
    split: "dev",
    type: "comparison",
    why: "Pocket ($39, 85 g) vs Pocket Pro ($55, 95 g): the Pro adds a push-button igniter and a wind shield. Both take isobutane canisters.",
    customer: null,
    turns: [
      {
        customer: "What's the difference between the Pocket stove and the Pocket Pro?",
        reply: { mentions: [["igniter", "ignition"], ["wind shield", "windshield", "wind-shield"]] },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judge: "Names the igniter and wind shield as the differences, with the price and weight gap. Doesn't invent boil times or output (not in the catalog).",
    },
  },
  {
    id: "comparison-03",
    split: "dev",
    type: "comparison",
    why: "Ember 0°C (down, 850 g) vs Drift -5°C (synthetic, 1700 g). The Drift is rated warmer; the Ember is half the weight. A reasoning check on two specs pulling in opposite directions.",
    customer: null,
    turns: [
      {
        customer: "Ember 0°C down bag or the Drift -5°C synthetic: which is warmer, and which is lighter?",
        reply: {
          mentions: [
            ["850 g", "850g", "0.85 kg"],
            ["1.7 kg", "1.7kg", "1700 g", "1700g", "1,700 g"],
          ],
        },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says the Drift -5°C is rated warmer (to -5°C vs 0°C) and the Ember 0°C is lighter."],
      judge: "May add that synthetic fill stays warm when damp (from the Drift's description). No invented fill weights or comfort ratings.",
    },
  },
]);
