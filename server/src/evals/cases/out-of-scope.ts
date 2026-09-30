import { defineCases } from "../case-schema.ts";

export const OUT_OF_SCOPE = defineCases([
  {
    id: "out-of-scope-01",
    split: "dev",
    type: "out_of_scope",
    why: "Weather isn't something the store can answer; the Router should redirect politely without starting an agent.",
    source: "spec table",
    customer: null,
    turns: [{ customer: "What's the weather going to be like in Yosemite this weekend?" }],
    expect: {
      route: "out_of_scope",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judge: "Politely says it can't help with weather, and says what it can help with (products, orders). No weather forecast, no made-up facts.",
    },
  },
  {
    id: "out-of-scope-02",
    split: "dev",
    type: "out_of_scope",
    why: "Close to the store's domain (hiking) but not something it can answer: there's no trail data. Tests that the Router doesn't send it to the shopping agent, and that nobody invents trail facts.",
    customer: null,
    turns: [{ customer: "Can you recommend a good hiking trail near Denver?" }],
    expect: {
      route: "out_of_scope",
      outcome: "resolved",
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent doesn't recommend a trail or state facts about trails."],
      judge: "Redirects politely; may offer help choosing gear for the hike.",
    },
  },
]);
