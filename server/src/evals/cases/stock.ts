import { defineCases } from "../case-schema.ts";

const OUT_OF_STOCK = ["out of stock", "sold out", "not in stock", "not available", "unavailable", "none left"];

export const STOCK = defineCases([
  {
    id: "stock-01",
    split: "dev",
    type: "stock",
    why: "Squall Rain Jacket M/green has 3 units (low stock). check_stock gives the variant; get_product also shows per-variant availability, so either is accepted (smoke-test finding, 2026-09-29).",
    source: "spec table",
    customer: null,
    turns: [
      {
        customer: "Do you have the Squall rain jacket in size M, green?",
        reply: { mentions: [["in stock", "3 left", "three left", "3 available", "three available", "3 units"]], avoids: OUT_OF_STOCK },
      },
    ],
    expect: {
      route: "shopping",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "check_stock", args: { productId: "jacket-squall" } }, { tool: "get_product", args: { id: "jacket-squall" } }] }],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: ["The agent says the Squall Rain Jacket in M, green is in stock."],
      judge: "Yes, in stock, and ideally that only a few are left.",
    },
  },
  {
    id: "stock-02",
    split: "dev",
    type: "stock",
    why: "Squall L/green is out of stock (0); L/navy has 9. Any alternative offered must really be in stock.",
    customer: null,
    turns: [{ customer: "Do you have the Squall rain jacket in large, in green?", reply: { mentions: [OUT_OF_STOCK] } }],
    expect: {
      route: "shopping",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "check_stock", args: { productId: "jacket-squall" } }, { tool: "get_product", args: { id: "jacket-squall" } }] }],
      },
      effects: { escalation: "forbidden" },
      judgeChecks: ["Any alternative the agent offers (another color, size or product) is in stock according to the tool results."],
      judge: "Says L/green is out of stock and offers L in navy. Doesn't promise a restock date (no tool gives one).",
    },
  },
  {
    id: "stock-03",
    split: "dev",
    type: "stock",
    why: "Ridge 2 orange is out of stock (green has 8). Then Maya asks about her order #1042 (shipped): the shopping agent must hand off to support. Tests a mid-conversation handoff.",
    customer: "maya.chen@example.com",
    turns: [
      { customer: "Is the Ridge 2 tent available in orange?", reply: { mentions: [OUT_OF_STOCK] } },
      {
        customer: "OK, thanks. Different question: has my order #1042 shipped yet?",
        assumes: "the agent answered the stock question",
        reply: { mentions: [["shipped", "on its way", "in transit"]] },
      },
    ],
    expect: {
      route: "shopping",
      finalAgent: "support",
      outcome: "resolved",
      tools: {
        required: [{ anyOf: [{ tool: "get_tracking", args: { orderId: 1042 } }, { tool: "get_order", args: { orderId: 1042 } }] }],
      },
      effects: { escalation: "forbidden" },
      judge: "Turn 1: orange is out, green is in stock. Turn 2: shipped, with tracking if looked up. The second reply doesn't repeat the stock answer.",
    },
  },
]);
