import { describe, expect, it } from "vitest";
import { quote, type ActivePromotions, type PricingProduct } from "../../src/policy/pricing.ts";
import type { CouponRecord } from "../../src/policy/coupons.ts";

const now = new Date("2026-09-15T12:00:00Z");

const tent: PricingProduct = { id: "tent-a", name: "Tent A", category: "tents", priceCents: 19999 };
const bag: PricingProduct = { id: "bag-a", name: "Bag A", category: "sleeping_bags", priceCents: 8900 };
const lampHi: PricingProduct = { id: "lamp-hi", name: "Lamp Hi", category: "headlamps", priceCents: 4000 };
const lampMid: PricingProduct = { id: "lamp-mid", name: "Lamp Mid", category: "headlamps", priceCents: 3000 };
const lampLo: PricingProduct = { id: "lamp-lo", name: "Lamp Lo", category: "headlamps", priceCents: 1999 };

const noPromos: ActivePromotions = {
  categorySales: [],
  buy2get1: [],
  shipping: { thresholdCents: 7500, flatRateCents: 799 },
};
const promos: ActivePromotions = {
  categorySales: [{ name: "Tent sale 20%", category: "tents", percentOff: 20 }],
  buy2get1: [{ name: "Headlamps buy 2 get 1", category: "headlamps" }],
  shipping: { thresholdCents: 7500, flatRateCents: 799 },
};

const coupon = (over: Partial<CouponRecord> = {}): CouponRecord => ({
  code: "SUMMER10",
  kind: "percent",
  value: 10,
  minSpendCents: 0,
  excludedCategories: [],
  expiresAt: new Date("2026-09-30T23:59:59Z"),
  singleUse: false,
  usedAt: null,
  customerId: null,
  ...over,
});

describe("quote", () => {
  it("prices a plain cart with no promotions", () => {
    const q = quote({ lines: [{ product: bag, qty: 2 }], promos: noPromos, now, customerId: null });
    expect(q.subtotalCents).toBe(17800);
    expect(q.promoDiscountCents).toBe(0);
    expect(q.shippingCents).toBe(0);
    expect(q.totalCents).toBe(17800);
    expect(q.display.total).toBe("$178.00");
  });

  it("applies the category sale per line with half-up rounding", () => {
    // 20% of 2 × $199.99 = $79.996 → $80.00
    const q = quote({ lines: [{ product: tent, qty: 2 }], promos, now, customerId: null });
    expect(q.lines[0]!.discounts).toEqual([{ label: "Tent sale 20%", amountCents: 8000 }]);
    expect(q.totalCents).toBe(39998 - 8000);
  });

  it("buy-2-get-1 makes the cheapest unit in each group of three free", () => {
    const q = quote({
      lines: [
        { product: lampHi, qty: 1 },
        { product: lampMid, qty: 1 },
        { product: lampLo, qty: 1 },
      ],
      promos,
      now,
      customerId: null,
    });
    expect(q.promoDiscountCents).toBe(1999);
    expect(q.lines[2]!.discounts).toEqual([{ label: "Headlamps buy 2 get 1", amountCents: 1999 }]);
  });

  it("buy-2-get-1 gives one free unit per full group only", () => {
    const five = quote({ lines: [{ product: lampMid, qty: 5 }], promos, now, customerId: null });
    expect(five.promoDiscountCents).toBe(3000);
    const six = quote({ lines: [{ product: lampMid, qty: 6 }], promos, now, customerId: null });
    expect(six.promoDiscountCents).toBe(6000);
    const two = quote({ lines: [{ product: lampMid, qty: 2 }], promos, now, customerId: null });
    expect(two.promoDiscountCents).toBe(0);
  });

  it("applies a coupon after automatic promotions", () => {
    // 2 tents: 39998 − 8000 sale = 31998; 10% coupon = 3199.8 → 3200
    const q = quote({
      lines: [{ product: tent, qty: 2 }],
      promos,
      coupon: { code: "summer10", record: coupon() },
      now,
      customerId: null,
    });
    expect(q.coupon).toMatchObject({ code: "SUMMER10", applied: true, discountCents: 3200 });
    expect(q.totalCents).toBe(31998 - 3200);
  });

  it("never honors an invalid coupon: the quote is simply without it", () => {
    const q = quote({
      lines: [{ product: tent, qty: 1 }],
      promos,
      coupon: { code: "OLD", record: coupon({ code: "OLD", expiresAt: new Date("2026-08-31T23:59:59Z") }) },
      now,
      customerId: null,
    });
    expect(q.coupon).toMatchObject({ applied: false, rejection: { code: "EXPIRED" } });
    expect(q.totalCents).toBe(19999 - 4000);
  });

  it("applies the coupon only to non-excluded categories", () => {
    const q = quote({
      lines: [
        { product: tent, qty: 1 },
        { product: bag, qty: 1 },
      ],
      promos: noPromos,
      coupon: { code: "X", record: coupon({ code: "X", value: 10, excludedCategories: ["tents"] }) },
      now,
      customerId: null,
    });
    expect(q.coupon).toMatchObject({ applied: true, discountCents: 890, eligibleSubtotalCents: 8900 });
  });

  it("an amount-off coupon never makes the eligible items negative", () => {
    const q = quote({
      lines: [{ product: lampLo, qty: 1 }],
      promos: noPromos,
      coupon: { code: "BIG", record: coupon({ code: "BIG", kind: "amount", value: 5000 }) },
      now,
      customerId: null,
    });
    expect(q.merchandiseTotalCents).toBe(0);
    expect(q.totalCents).toBe(799);
  });

  describe("shipping threshold", () => {
    const item = (priceCents: number): PricingProduct => ({ id: "x", name: "X", category: "stoves", priceCents });
    it("is free at exactly the threshold", () => {
      expect(quote({ lines: [{ product: item(7500), qty: 1 }], promos: noPromos, now, customerId: null }).shippingCents).toBe(0);
    });
    it("charges the flat rate one cent below", () => {
      const q = quote({ lines: [{ product: item(7499), qty: 1 }], promos: noPromos, now, customerId: null });
      expect(q.shippingCents).toBe(799);
      expect(q.display.shipping).toBe("$7.99");
    });
    it("is judged after discounts, including the coupon", () => {
      const q = quote({
        lines: [{ product: item(8000), qty: 1 }],
        promos: noPromos,
        coupon: { code: "SUMMER10", record: coupon() },
        now,
        customerId: null,
      });
      expect(q.merchandiseTotalCents).toBe(7200);
      expect(q.shippingCents).toBe(799);
    });
  });
});
