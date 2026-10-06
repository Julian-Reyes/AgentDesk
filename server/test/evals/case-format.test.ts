import { describe, expect, it } from "vitest";
import { defineCases, EvalCase, type EvalCaseInput } from "../../src/evals/case-schema.ts";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { validateCases } from "../../src/evals/validate-cases.ts";

const byId = (id: string) => structuredClone(ALL_CASES.find((c) => c.id === id)!);

const minimal: EvalCaseInput = {
  id: "x-01",
  split: "dev",
  type: "out_of_scope",
  why: "A minimal valid case.",
  customer: null,
  turns: [{ customer: "Hello" }],
  expect: { route: "out_of_scope", outcome: "resolved" },
};

describe("eval case schema", () => {
  it("defaults to no money effects and escalation allowed", () => {
    const [c] = defineCases([minimal]);
    expect(c!.expect.effects).toEqual({ refunds: [], goodwill: [], allowed: { refunds: [], goodwill: [] }, escalation: "allowed" });
    expect(c!.expect.judgeChecks).toEqual([]);
    expect(c!.expect.tools).toEqual({ required: [], forbidden: [] });
    expect(c!.expect.leaks).toEqual([]);
  });

  it("rejects unknown keys, so a typo can't silently drop a check", () => {
    const typo = { ...minimal, turns: [{ customer: "Hi", reply: { mention: ["x"] } }] };
    expect(() => defineCases([typo as EvalCaseInput])).toThrow(/x-01/);
  });

  it("rejects unknown tools", () => {
    const c = { ...minimal, expect: { ...minimal.expect, tools: { forbidden: ["issue_refund_now"] } } };
    expect(EvalCase.safeParse(c).success).toBe(false);
  });

  it("never expects a failed outcome", () => {
    expect(EvalCase.safeParse({ ...minimal, expect: { ...minimal.expect, outcome: "failed" } }).success).toBe(false);
  });

  it("requires a reason for an invalid coupon, and exactly one cart for a coupon check", () => {
    const price = { cart: [{ productId: "tent-ridge-2", qty: 1 }], coupon: "SPRING15", totalCents: 19920 };
    const ok = { ...minimal, expect: { ...minimal.expect, price, coupon: { code: "SPRING15", valid: false, reason: "EXPIRED" } } };
    expect(EvalCase.safeParse(ok).success).toBe(true);
    expect(EvalCase.safeParse({ ...ok, expect: { ...ok.expect, coupon: { code: "SPRING15", valid: false } } }).success).toBe(false);
    expect(EvalCase.safeParse({ ...ok, expect: { ...ok.expect, coupon: { code: "SUMMER10", valid: true, reason: "EXPIRED" } } }).success).toBe(false);
    expect(EvalCase.safeParse({ ...ok, expect: { ...minimal.expect, coupon: { code: "SPRING15", valid: false, reason: "EXPIRED" } } }).success).toBe(false);
    // Its own cart instead of a price check is fine; both at once is ambiguous.
    const cart = [{ productId: "pack-swift-20", qty: 1 }];
    expect(EvalCase.safeParse({ ...ok, expect: { ...minimal.expect, coupon: { code: "SPRING15", valid: false, reason: "EXPIRED", cart } } }).success).toBe(true);
    expect(EvalCase.safeParse({ ...ok, expect: { ...ok.expect, coupon: { code: "SPRING15", valid: false, reason: "EXPIRED", cart } } }).success).toBe(false);
  });

  it("requires every turn after the first to say what it assumes", () => {
    const turns = [{ customer: "Something broke" }, { customer: "The headlamp" }];
    const parsed = EvalCase.safeParse({ ...minimal, turns });
    expect(parsed.success).toBe(false);
    expect(parsed.error!.issues[0]!.path).toEqual(["turns", 1, "assumes"]);
    expect(EvalCase.safeParse({ ...minimal, turns: [turns[0], { ...turns[1], assumes: "the agent asked which item" }] }).success).toBe(true);
  });

  it("rejects a price turn that doesn't exist", () => {
    const price = { cart: [{ productId: "tent-ridge-2", qty: 1 }], totalCents: 19920, turn: 2 };
    expect(EvalCase.safeParse({ ...minimal, expect: { ...minimal.expect, price } }).success).toBe(false);
  });
});

describe("validateCases (against the seed data)", () => {
  it("catches a price total that quote() wouldn't give", () => {
    const c = byId("price-deals-01");
    c.expect.price!.totalCents = 35855;
    expect(validateCases([c])).toEqual(["price-deals-01: price total is $358.56 per quote(), case says $358.55"]);
  });

  it("checks a coupon against its own cart", () => {
    const c = byId("invalid-coupon-03");
    expect(validateCases([c])).toEqual([]);
    c.expect.coupon!.cart = [{ productId: "pack-swift-30", qty: 2 }]; // $238: meets the $150 minimum
    expect(validateCases([c])).toEqual(["invalid-coupon-03: coupon TRAIL25 is valid for this cart, case says invalid"]);
  });

  it("checks allowed refunds and coupons against the rules too", () => {
    const c = byId("order-status-04");
    expect(validateCases([c])).toEqual([]);
    c.expect.effects.allowed.goodwill = [{ maxPercent: 10, status: "issued" }]; // Sofia got one 10 days ago
    c.expect.effects.allowed.refunds = [{ order: 1055, amountCents: 800, reason: "late", status: "issued" }]; // shipping was $7.99
    expect(validateCases([c])).toEqual([
      "order-status-04: allowed refund of $8.00 on 1055 would be denied (AMOUNT_EXCEEDS_REFUNDABLE) by the refund rules, case says issued",
      "order-status-04: an allowed 10% goodwill coupon would be queued_for_approval, case says issued",
    ]);
  });

  it("checks allowed effects after the required ones", () => {
    // Required: the $7.99 late refund. An allowed second one would exceed what's refundable for shipping.
    const c = byId("refund-within-limit-02");
    c.expect.effects.allowed.refunds = [{ order: 1055, amountCents: 799, reason: "late", status: "issued" }];
    expect(validateCases([c])[0]).toMatch(/allowed refund of \$7.99 on 1055 would be denied \(NOTHING_REFUNDABLE\)/);
  });

  it("requires approval_needed as an outcome when money can be left pending", () => {
    // refund-within-limit-03 allows a queued goodwill coupon; dev-dmg-2 failed a
    // correct run on "resolved" alone (2026-10-06).
    const c = byId("refund-within-limit-03");
    expect(validateCases([c])).toEqual([]);
    c.expect.outcome = "resolved";
    expect(validateCases([c])).toEqual([
      "refund-within-limit-03: a refund or coupon can be pending_approval, which makes the outcome approval_needed, but the case expects resolved",
    ]);
    // Escalation outranks approval_needed, so a case that requires it is fine.
    c.expect.outcome = "escalated";
    expect(validateCases([c])).toEqual([]);
  });

  it("catches a damaged refund on a multi-item order for an item the customer never names (round 3)", () => {
    const c = byId("refund-within-limit-03");
    expect(validateCases([c])).toEqual([]);
    c.turns = [c.turns[0]!]; // only "Something from my order #1074 arrived broken"
    expect(validateCases([c])).toContain(
      "refund-within-limit-03: required damaged refund for lamp-firefly-kids on 1074: the customer never names that item, so issue_refund would refuse it",
    );
  });

  it("catches allowed money effects for an anonymous visitor", () => {
    const c = byId("out-of-scope-01");
    c.expect.effects.allowed.goodwill = [{ maxPercent: 10, status: "issued" }];
    expect(validateCases([c])[0]).toBe("out-of-scope-01: an anonymous visitor can't receive refunds or coupons");
  });

  it("catches a wrong coupon verdict and a wrong rejection reason", () => {
    const c = byId("price-deals-01");
    c.expect.price = { cart: [{ productId: "tent-ridge-2", qty: 1 }], coupon: "SPRING15", totalCents: 19920 };
    c.expect.coupon = { code: "SPRING15", valid: true };
    expect(validateCases([c])).toEqual(["price-deals-01: coupon SPRING15 is invalid for this cart, case says valid"]);
    c.expect.coupon = { code: "SPRING15", valid: false, reason: "MIN_SPEND_NOT_MET" };
    expect(validateCases([c])).toEqual(["price-deals-01: coupon SPRING15 is rejected with EXPIRED, case says MIN_SPEND_NOT_MET"]);
    c.expect.coupon = { code: "SPRING15", valid: false, reason: "EXPIRED" };
    expect(validateCases([c])).toEqual([]);
  });

  it("catches a refund status the refund rules wouldn't give", () => {
    const c = byId("refund-within-limit-01");
    c.expect.effects.refunds[0]!.status = "pending_approval";
    expect(validateCases([c])).toEqual([
      "refund-within-limit-01: required refund of $29.00 on 1050 would be auto_approved by the refund rules, case says pending_approval",
    ]);
  });

  it("catches a refund above what was paid for the item", () => {
    const c = byId("refund-within-limit-01");
    c.expect.effects.refunds[0]!.amountCents = 3000;
    expect(validateCases([c])[0]).toMatch(/would be denied \(AMOUNT_EXCEEDS_REFUNDABLE\)/);
  });

  it("catches the $179.99 item being refunded automatically", () => {
    const c = byId("refund-within-limit-01");
    c.customer = "priya.raman@example.com";
    c.expect.effects.refunds = [{ order: 1051, amountCents: 17999, reason: "damaged", item: "bag-harbor-double", status: "issued" }];
    expect(validateCases([c])[0]).toMatch(/would be queued_for_approval/);
  });

  it("catches a refund on someone else's order", () => {
    const c = byId("refund-within-limit-01");
    c.customer = "daniel.okafor@example.com";
    expect(validateCases([c])).toEqual([
      "refund-within-limit-01: required refund on order 1050, which isn't daniel.okafor@example.com's",
      "refund-within-limit-01: an allowed goodwill coupon for order 1050, which isn't daniel.okafor@example.com's",
    ]);
  });

  it("catches money effects for an anonymous visitor", () => {
    const c = byId("refund-within-limit-01");
    c.customer = null;
    expect(validateCases([c])[0]).toBe("refund-within-limit-01: an anonymous visitor can't receive refunds or coupons");
  });

  it("catches a goodwill coupon inside the once-a-month limit", () => {
    const c = byId("out-of-scope-01");
    c.customer = "sofia.alvarez@example.com"; // got one 10 days ago
    c.expect.effects.goodwill = [{ percent: 10, order: 1055, status: "issued" }]; // #1055 is delayed: store-caused
    expect(validateCases([c])).toEqual(["out-of-scope-01: a required 10% goodwill coupon for 1055 would be queued_for_approval, case says issued"]);
    c.customer = "tom.becker@example.com";
    c.expect.effects.goodwill = [{ percent: 10, order: 1054, status: "issued" }]; // lost, and Tom has had none
    expect(validateCases([c])).toEqual([]);
  });

  it("catches an automatic goodwill coupon without a store-caused problem (goodwill rule, 2026-10-01)", () => {
    const c = byId("out-of-scope-01");
    c.customer = "tom.becker@example.com";
    c.expect.outcome = "approval_needed"; // what a queued coupon makes the run
    c.expect.effects.goodwill = [{ percent: 10, order: 1053, status: "issued" }]; // worn boots: customer-side
    expect(validateCases([c])).toEqual(["out-of-scope-01: a required 10% goodwill coupon for 1053 would be queued_for_approval, case says issued"]);
    c.expect.effects.goodwill = [{ percent: 10, status: "issued" }]; // no order at all
    expect(validateCases([c])).toEqual(["out-of-scope-01: a required 10% goodwill coupon would be queued_for_approval, case says issued"]);
    c.expect.effects.goodwill = [{ percent: 10, order: 1053, status: "pending_approval" }];
    expect(validateCases([c])).toEqual([]);
  });

  it("damage goes on record with the damaged-item refund, so a coupon before it is queued and one after it is issued", () => {
    const c = byId("refund-within-limit-01");
    expect(c.expect.effects.allowed.goodwill).toEqual([{ maxPercent: 10, order: 1050, status: ["issued", "pending_approval"] }]);
    expect(validateCases([c])).toEqual([]);
    // Without the case's refund, #1050 has nothing on record: only "queued" is possible.
    c.expect.effects.refunds = [];
    expect(validateCases([c])).toEqual(["refund-within-limit-01: an allowed 10% goodwill coupon for 1050 would be queued_for_approval, case says issued"]);
  });

  it("catches an acceptable list that doesn't match the catalog", () => {
    const c = byId("recommendation-01");
    c.expect.recommendation!.acceptable = ["tent-ridge-2", "tent-canopy-2"];
    expect(validateCases([c])).toEqual([
      "recommendation-01: acceptable products should be [tent-canopy-2, tent-creek-2, tent-ridge-2], case says [tent-canopy-2, tent-ridge-2]",
    ]);
    c.expect.recommendation!.acceptable = ["tent-ridge-2", "tent-canopy-2", "tent-creek-2", "tent-summit-3"];
    expect(validateCases([c])[0]).toMatch(/should be \[tent-canopy-2, tent-creek-2, tent-ridge-2\]/);
  });

  it("catches unknown customers, products and orders, and duplicate ids", () => {
    const a = byId("order-status-01");
    a.customer = "nobody@example.com";
    a.expect.tools.required = [{ tool: "get_order", args: { orderId: 9999 } }, { tool: "get_product", args: { id: "tent-nope" } }];
    const b = byId("order-status-01");
    expect(validateCases([a, b])).toEqual([
      "order-status-01: unknown customer nobody@example.com",
      "order-status-01: unknown product tent-nope",
      "order-status-01: unknown order 9999",
      "order-status-01: duplicate id",
    ]);
  });
});
