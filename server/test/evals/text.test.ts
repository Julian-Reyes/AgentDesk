import { describe, expect, it } from "vitest";
import { containsAny, containsPhrase, normalize, parseAmounts, rawOutputProblems } from "../../src/evals/grading/text.ts";

describe("normalize / containsPhrase", () => {
  it("tolerates case, curly quotes, dashes, spacing and degree spellings", () => {
    expect(normalize("It’s  the Ember 0 °C – in stock")).toBe("it's the ember 0°c - in stock");
    expect(normalize("rated to 23 degrees F")).toBe("rated to 23°f");
    expect(normalize("−5°C")).toBe("-5°c");
    expect(containsPhrase("Your order has SHIPPED.", "shipped")).toBe(true);
    expect(containsPhrase("It isn’t waterproof", "isn't waterproof")).toBe(true);
    expect(containsAny("We're sold out in L", ["out of stock", "sold out"])).toBe(true);
    expect(containsAny("In stock", ["out of stock", "sold out"])).toBe(false);
  });
});

describe("parseAmounts", () => {
  it("reads dollar amounts in the ways models write them, in cents", () => {
    expect(parseAmounts("Total: $358.56")).toEqual([35856]);
    expect(parseAmounts("$151.2 now")).toEqual([15120]);
    expect(parseAmounts("$1,234.50 and $5")).toEqual([123450, 500]);
    expect(parseAmounts("Discounts: -$139.44")).toEqual([13944]);
    expect(parseAmounts("151.20 USD, or 20 dollars")).toEqual([15120, 2000]);
    expect(parseAmounts("$ 29.00")).toEqual([2900]);
  });

  it("ignores numbers that aren't money", () => {
    expect(parseAmounts("Order #1042, 20% off, 1.9 kg, 3 left, PW0008251598")).toEqual([]);
  });
});

describe("rawOutputProblems", () => {
  it("passes ordinary replies, including the words reply and handoff", () => {
    expect(rawOutputProblems("Your order #1042 has shipped! I'll hand off any questions about returns to our team.")).toEqual([]);
    expect(rawOutputProblems("Thanks for your reply. The price is {as quoted} $10.")).toEqual([]);
  });

  it("flags JSON, fenced JSON, control tokens, tool names and tool calls", () => {
    expect(rawOutputProblems('{"message":"Hi there"}')).toContain("starts with JSON");
    expect(rawOutputProblems('Sure! {"status": "shipped"}')).toContain("a JSON object");
    expect(rawOutputProblems('```json\n{"a":1}\n```')).toContain("a fenced JSON block");
    expect(rawOutputProblems("<|call|>functions.get_order")).toEqual(expect.arrayContaining(["a model control token", "a function-call prefix", "a tool name"]));
    expect(rawOutputProblems("Let me run get_order for you.")).toEqual(["a tool name"]);
    expect(rawOutputProblems('reply(message="hi")')).toEqual(["a tool call"]);
  });
});
