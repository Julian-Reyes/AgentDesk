import { describe, expect, it } from "vitest";
import { checkCoupon, type CouponRecord } from "../../src/policy/coupons.ts";
import { applyAutomaticPromotions, type ActivePromotions } from "../../src/policy/pricing.ts";

const now = new Date("2026-09-15T12:00:00Z");
const promos: ActivePromotions = { categorySales: [], buy2get1: [], shipping: { thresholdCents: 7500, flatRateCents: 799 } };
const lines = applyAutomaticPromotions(
  [
    { product: { id: "tent", name: "Tent", category: "tents", priceCents: 20000 }, qty: 1 },
    { product: { id: "stove", name: "Stove", category: "stoves", priceCents: 5000 }, qty: 1 },
  ],
  promos,
);

const base: CouponRecord = {
  code: "SAVE",
  kind: "percent",
  value: 15,
  minSpendCents: 0,
  excludedCategories: [],
  expiresAt: new Date("2026-12-31T23:59:59Z"),
  singleUse: false,
  usedAt: null,
  customerId: null,
};
const check = (over: Partial<CouponRecord> | null, customerId: number | null = null) =>
  checkCoupon(over === null ? null : { ...base, ...over }, " save ", { lines, now, customerId });

describe("checkCoupon", () => {
  it("accepts a valid coupon and normalizes the code", () => {
    expect(check({})).toMatchObject({ valid: true, code: "SAVE", discountCents: 3750 });
  });

  it("rejects an unknown code", () => {
    expect(check(null)).toMatchObject({ valid: false, code: "NOT_FOUND" });
  });

  it("rejects an expired code, even by one second", () => {
    expect(check({ expiresAt: new Date("2026-09-15T11:59:59Z") })).toMatchObject({ valid: false, code: "EXPIRED" });
  });

  it("accepts a code on its last valid instant", () => {
    expect(check({ expiresAt: new Date("2026-09-15T12:00:00Z") })).toMatchObject({ valid: true });
  });

  it("rejects a single-use code that was already used", () => {
    expect(check({ singleUse: true, usedAt: new Date("2026-09-01") })).toMatchObject({ valid: false, code: "ALREADY_USED" });
  });

  it("rejects when every item is in an excluded category", () => {
    expect(check({ excludedCategories: ["tents", "stoves"] })).toMatchObject({ valid: false, code: "CATEGORY_EXCLUDED" });
  });

  it("checks minimum spend against eligible items only", () => {
    // Tents excluded → eligible subtotal is the $50 stove, below the $60 minimum.
    const r = check({ excludedCategories: ["tents"], minSpendCents: 6000 });
    expect(r).toMatchObject({ valid: false, code: "MIN_SPEND_NOT_MET", details: { shortBy: "$10.00" } });
  });

  it("goodwill codes only work for their owner, and look unknown to everyone else", () => {
    expect(check({ customerId: 7 }, 7)).toMatchObject({ valid: true });
    expect(check({ customerId: 7 }, 8)).toMatchObject({ valid: false, code: "NOT_FOUND" });
    expect(check({ customerId: 7 }, null)).toMatchObject({ valid: false, code: "NOT_FOUND" });
  });
});
