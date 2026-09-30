import { describe, expect, it } from "vitest";
import { createGradingCatalog } from "../../src/evals/grading/catalog.ts";
import { checkGrounding, type GroundingEvidence } from "../../src/evals/grading/grounding.ts";

const catalog = createGradingCatalog();
const none: GroundingEvidence = { toolResults: [], customerText: [], earlierReplies: [] };
const check = (reply: string, evidence: Partial<GroundingEvidence> = {}) => checkGrounding(reply, { ...none, ...evidence }, catalog);
const violations = (reply: string, evidence: Partial<GroundingEvidence> = {}) => check(reply, evidence).violations.map((v) => `${v.kind}: ${v.text}`);

// Trimmed-down but real-shaped tool results.
const RIDGE_PRODUCT = JSON.stringify({ ok: true, data: { id: "tent-ridge-2", name: "Ridge 2 Backpacking Tent", listPrice: "$249.00", currentPrice: "$199.20", specs: { capacityPersons: 2, weightGrams: 1900, waterproofRatingMm: 3000 } } });
const QUOTE_2_RIDGE = JSON.stringify({ ok: true, data: { subtotal: "$498.00", totalDiscounts: "-$139.44", shipping: "FREE", total: "$358.56", totalCents: 35856 } });

describe("grounding: a correct reply passes", () => {
  it("catalog facts, prices and specs of named products", () => {
    const reply = "The Ridge 2 Backpacking Tent is waterproof (3,000 mm) and weighs 1.9 kg, about 4.2 lb. It sleeps 2 people and is $199.20 right now (was $249.00).";
    expect(check(reply, { toolResults: [RIDGE_PRODUCT] })).toEqual({ violations: [], warnings: [] });
    // Catalog prices of a named product count as grounded even without the tool result.
    expect(violations("The Ridge 2 is $199.20 during the tent sale.")).toEqual([]);
  });

  it("amounts from a quote, the customer's own words, and earlier replies", () => {
    expect(violations("Two Ridge 2 tents with SUMMER10 come to $358.56, with free shipping.", { toolResults: [QUOTE_2_RIDGE] })).toEqual([]);
    expect(violations("I can't match the $150 price you found.", { customerText: ["Amazon has it for $150"] })).toEqual([]);
    expect(violations("As I said, that's $358.56.", { earlierReplies: ["The total is $358.56."] })).toEqual([]);
    expect(violations("Shipping is $0.00 on this order.")).toEqual([]);
  });

  it("unit conversions and product names that contain numbers", () => {
    expect(violations("The Drift -5°C is rated to 23°F.")).toEqual([]);
    expect(violations("The Ember 0°C Down Sleeping Bag weighs 850 g.")).toEqual([]); // "0°C" is part of the name
    expect(violations("The Beacon 900 gives 900 lumens for 15 hours.")).toEqual([]);
    expect(violations("The Quickboil Cook System has a 1-liter pot.")).toEqual([]);
    expect(violations("Isobutane Fuel Canister 230 g")).toEqual([]); // "230 g" is in the name, not a weight claim
  });

  it("order numbers, dates and tracking numbers aren't mistaken for claims", () => {
    expect(violations("Order #1042 shipped on 2026-09-13 (tracking PW0008251598); expect it Sep 16–19, in 3–6 business days.")).toEqual([]);
  });
});

describe("grounding: invented facts are flagged", () => {
  it("a total the model worked out itself, even if close", () => {
    expect(violations("Two Ridge 2 tents with SUMMER10 come to $358.50.", { toolResults: [QUOTE_2_RIDGE] })).toEqual(["price: $358.50"]);
  });

  it("a saving computed by the model (prices must come from quote_price)", () => {
    expect(violations("The Ridge 2 is $199.20, so you save $49.80.")).toEqual(["price: $49.80"]);
  });

  it("wrong specs, including wrong conversions", () => {
    expect(violations("The Ridge 2 weighs 1.5 kg.")).toEqual(["spec: 1.5 kg"]);
    expect(violations("The Ridge 2 weighs 4.5 lb.")).toEqual(["spec: 4.5 lb"]);
    expect(violations("The Beacon 900 lasts 20 hours.")).toEqual(["spec: 20 hours"]);
    expect(violations("The Drift -5°C is rated to 10°F.")).toEqual(["spec: 10°F"]);
    expect(violations("The Ridge 2 has a 5000 mm rating.")).toEqual(["spec: 5000 mm"]);
  });

  it("an invented model number in a real family", () => {
    expect(violations("You might like the Ridge 3 or the Beacon 700.")).toEqual(["unknown_product: Ridge 3", "unknown_product: Beacon 700"]);
  });

  it("a waterproof claim that contradicts the catalog, for a sentence about one product", () => {
    expect(violations("The Swift 30 Daypack is waterproof.")).toEqual(["claim: The Swift 30 Daypack is waterproof."]);
    expect(violations("The Ridge 2 is not waterproof.")).toEqual(["claim: The Ridge 2 is not waterproof."]);
    expect(violations("The Swift 30 isn't waterproof, but it comes with a rain cover.")).toEqual([]);
    // A rating is a spec, not a yes/no claim (the Gale is water-resistant with a 5000 mm rating).
    expect(violations("The Gale Softshell has a 5,000 mm waterproof rating.")).toEqual([]);
    // Two products in one sentence: too ambiguous to judge, so not flagged.
    expect(violations("The Swift 30 and the Ridge 2 are waterproof.")).toEqual([]);
  });
});

describe("grounding: warnings don't count as violations", () => {
  it("an unknown product-like name is a warning for a human to read", () => {
    const r = check("Try our Trailblazer Tent for that.");
    expect(r.violations).toEqual([]);
    expect(r.warnings.map((w) => w.text)).toEqual(["Trailblazer Tent"]);
    expect(check("The Rain Jacket and Our Tent Sale").warnings).toEqual([]);
  });
});

describe("grounding: known limitations (kept visible on purpose)", () => {
  it("a spec is checked against every product in play, not the one it's attached to", () => {
    // 20 hours is the Beacon 500's burn time, attributed here to the Beacon 900. With both named,
    // the checker can't tell which product the number belongs to, so it doesn't flag it.
    expect(violations("The Beacon 900 lasts 20 hours; the Beacon 500 is lighter.")).toEqual([]);
  });
});
