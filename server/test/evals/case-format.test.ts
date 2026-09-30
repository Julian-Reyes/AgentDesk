import { describe, expect, it } from "vitest";
import { defineCases, EvalCase, type EvalCaseInput } from "../../src/evals/case-schema.ts";
import { FORMAT_EXAMPLES } from "../../src/evals/cases/format-examples.ts";
import { validateCases } from "../../src/evals/validate-cases.ts";

const byId = (id: string) => structuredClone(FORMAT_EXAMPLES.find((c) => c.id === id)!);

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
  it("parses the format examples", () => {
    expect(FORMAT_EXAMPLES.length).toBe(7);
  });

  it("defaults to no money effects and escalation allowed", () => {
    const [c] = defineCases([minimal]);
    expect(c!.expect.effects).toEqual({ refunds: [], goodwill: [], escalation: "allowed" });
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

  it("requires a reason for an invalid coupon, and a price check for any coupon check", () => {
    const price = { cart: [{ productId: "tent-ridge-2", qty: 1 }], coupon: "SPRING15", totalCents: 19920 };
    const ok = { ...minimal, expect: { ...minimal.expect, price, coupon: { code: "SPRING15", valid: false, reason: "EXPIRED" } } };
    expect(EvalCase.safeParse(ok).success).toBe(true);
    expect(EvalCase.safeParse({ ...ok, expect: { ...ok.expect, coupon: { code: "SPRING15", valid: false } } }).success).toBe(false);
    expect(EvalCase.safeParse({ ...ok, expect: { ...ok.expect, coupon: { code: "SUMMER10", valid: true, reason: "EXPIRED" } } }).success).toBe(false);
    expect(EvalCase.safeParse({ ...ok, expect: { ...minimal.expect, coupon: { code: "SPRING15", valid: false, reason: "EXPIRED" } } }).success).toBe(false);
  });

  it("rejects a price turn that doesn't exist", () => {
    const price = { cart: [{ productId: "tent-ridge-2", qty: 1 }], totalCents: 19920, turn: 2 };
    expect(EvalCase.safeParse({ ...minimal, expect: { ...minimal.expect, price } }).success).toBe(false);
  });
});

describe("validateCases (against the seed data)", () => {
  it("finds no problems in the format examples", () => {
    expect(validateCases(FORMAT_EXAMPLES)).toEqual([]);
  });

  it("catches a price total that quote() wouldn't give", () => {
    const c = byId("price-deals-01");
    c.expect.price!.totalCents = 35855;
    expect(validateCases([c])).toEqual(["price-deals-01: price total is $358.56 per quote(), case says $358.55"]);
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
      "refund-within-limit-01: refund of $29.00 on 1050 would be auto_approved by the refund rules, case says pending_approval",
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
    expect(validateCases([c])).toEqual(["refund-within-limit-01: refund on order 1050, which isn't daniel.okafor@example.com's"]);
  });

  it("catches money effects for an anonymous visitor", () => {
    const c = byId("refund-within-limit-01");
    c.customer = null;
    expect(validateCases([c])[0]).toBe("refund-within-limit-01: an anonymous visitor can't receive refunds or coupons");
  });

  it("catches a goodwill coupon inside the once-a-month limit", () => {
    const c = byId("out-of-scope-01");
    c.customer = "sofia.alvarez@example.com"; // got one 10 days ago
    c.expect.effects.goodwill = [{ percent: 10, status: "issued" }];
    expect(validateCases([c])).toEqual(["out-of-scope-01: a 10% goodwill coupon would be queued_for_approval, case says issued"]);
    c.customer = "maya.chen@example.com";
    expect(validateCases([c])).toEqual([]);
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
