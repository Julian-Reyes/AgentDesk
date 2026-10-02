import { describe, expect, it } from "vitest";
import { decideRefund, type RefundItem, type RefundOrderState } from "../../src/policy/refunds.ts";
import { POLICY_DOCS } from "../../src/seed/policies.ts";

const now = new Date("2026-09-15T12:00:00Z");
const delivered: RefundOrderState = {
  status: "delivered",
  deliveredAt: new Date("2026-09-10T12:00:00Z"),
  shippingCents: 799,
  totalPaidCents: 20000,
  issuedCents: 0,
  pendingCents: 0,
};
/** A cheap item ($29, like the anchor headlamp) and one the size of the whole order. */
const cheap: RefundItem = { name: "Headlamp", paidCents: 2900, qty: 1, refundableCents: 2900 };
const whole: RefundItem = { name: "Tent", paidCents: 20000, qty: 1, refundableCents: 20000 };

describe("decideRefund", () => {
  it("auto-approves a damaged item that cost up to and including $50", () => {
    expect(decideRefund(delivered, "damaged", 2900, now, cheap)).toEqual({ decision: "auto_approved", amountCents: 2900 });
    const fifty = { name: "Stove", paidCents: 5000, qty: 1, refundableCents: 5000 };
    expect(decideRefund(delivered, "damaged", 5000, now, fifty)).toEqual({ decision: "auto_approved", amountCents: 5000 });
  });

  it("a damaged item that cost over $50 always goes to approval, even for a small amount", () => {
    // Regression (2026-09-29): an agent refunded $50 of a $179.99 item automatically and escalated the rest.
    const bag = { name: "Harbor Double Sleeping Bag", paidCents: 17999, qty: 1, refundableCents: 17999 };
    expect(decideRefund(delivered, "damaged", 5000, now, bag)).toMatchObject({ decision: "queued_for_approval", why: expect.stringMatching(/\$179\.99/) });
    expect(decideRefund(delivered, "damaged", 100, now, bag).decision).toBe("queued_for_approval");
    const fiftyOne = { name: "Stove", paidCents: 5001, qty: 1, refundableCents: 5001 };
    expect(decideRefund(delivered, "damaged", 5001, now, fiftyOne).decision).toBe("queued_for_approval");
  });

  it("a damaged refund must name the item", () => {
    expect(decideRefund(delivered, "damaged", 1000, now)).toMatchObject({ decision: "denied", code: "ITEM_REQUIRED" });
  });

  it("a damaged refund can't exceed what's still refundable for that item", () => {
    expect(decideRefund(delivered, "damaged", 2901, now, cheap)).toMatchObject({ code: "AMOUNT_EXCEEDS_REFUNDABLE", details: { maxRefundableCents: 2900 } });
    const partlyRefunded = { ...cheap, refundableCents: 900 };
    expect(decideRefund(delivered, "damaged", 900, now, partlyRefunded).decision).toBe("auto_approved");
    expect(decideRefund(delivered, "damaged", 901, now, partlyRefunded)).toMatchObject({ code: "AMOUNT_EXCEEDS_REFUNDABLE" });
    expect(decideRefund(delivered, "damaged", 100, now, { ...cheap, refundableCents: 0 })).toMatchObject({ code: "NOTHING_REFUNDABLE" });
  });

  it("still counts earlier refunds on the order, so cheap items can't add up past $50 automatically", () => {
    const afterOne = { ...delivered, issuedCents: 4500 };
    expect(decideRefund(afterOne, "damaged", 900, now, cheap).decision).toBe("queued_for_approval");
  });

  it("counts pending refunds against both the limit and the cap", () => {
    const pending = { ...delivered, pendingCents: 18000 };
    expect(decideRefund(pending, "damaged", 1000, now, cheap).decision).toBe("queued_for_approval");
    expect(decideRefund(pending, "damaged", 2001, now, whole)).toMatchObject({ decision: "denied", code: "AMOUNT_EXCEEDS_REFUNDABLE" });
  });

  it("never refunds more than the order paid", () => {
    expect(decideRefund(delivered, "damaged", 20001, now, { ...whole, refundableCents: 99999 })).toMatchObject({
      decision: "denied",
      code: "AMOUNT_EXCEEDS_REFUNDABLE",
      details: { maxRefundableCents: 20000 },
    });
  });

  it("denies when everything has already been refunded", () => {
    expect(decideRefund({ ...delivered, issuedCents: 20000 }, "damaged", 100, now, whole)).toMatchObject({
      decision: "denied",
      code: "NOTHING_REFUNDABLE",
    });
  });

  it("rejects zero, negative and fractional amounts", () => {
    for (const amount of [0, -100, 10.5]) {
      expect(decideRefund(delivered, "damaged", amount, now, cheap)).toMatchObject({ decision: "denied", code: "INVALID_AMOUNT" });
    }
  });

  it("requires the reason to match the order state", () => {
    expect(decideRefund(delivered, "lost", 1000, now)).toMatchObject({ code: "REASON_DOES_NOT_MATCH_ORDER" });
    expect(decideRefund(delivered, "late", 500, now)).toMatchObject({ code: "REASON_DOES_NOT_MATCH_ORDER" });
    expect(decideRefund({ ...delivered, status: "shipped", deliveredAt: null }, "damaged", 500, now, cheap)).toMatchObject({
      code: "REASON_DOES_NOT_MATCH_ORDER",
    });
  });

  it("allows damage reports up to day 14 after delivery, not day 15", () => {
    const d14 = { ...delivered, deliveredAt: new Date("2026-09-01T12:00:00Z") };
    const d15 = { ...delivered, deliveredAt: new Date("2026-08-31T12:00:00Z") };
    expect(decideRefund(d14, "damaged", 1000, now, cheap).decision).toBe("auto_approved");
    expect(decideRefund(d15, "damaged", 1000, now, cheap)).toMatchObject({ code: "DAMAGE_REPORT_WINDOW_EXPIRED" });
  });

  it("counts the damage window in calendar days, not 24-hour periods", () => {
    // Store "now" is noon. Delivered Aug 31 in the afternoon is 15 calendar days ago
    // (outside), though under 15 x 24 hours; Sep 1 late at night is 14 (inside).
    const lateAug31 = { ...delivered, deliveredAt: new Date("2026-08-31T15:00:00Z") };
    const lateSep1 = { ...delivered, deliveredAt: new Date("2026-09-01T23:30:00Z") };
    expect(decideRefund(lateAug31, "damaged", 1000, now, cheap)).toMatchObject({
      code: "DAMAGE_REPORT_WINDOW_EXPIRED",
      details: { daysSinceDelivery: 15 },
    });
    expect(decideRefund(lateSep1, "damaged", 1000, now, cheap).decision).toBe("auto_approved");
  });

  it("judges a damaged item by one unit's price, keeping the $50 order total (Julian, 2026-10-02)", () => {
    // Two $49 headlamps on one line ($98): one damaged lamp is a $49 item, so it's automatic.
    const pair: RefundItem = { name: "Beacon 500", paidCents: 9800, qty: 2, refundableCents: 9800 };
    expect(decideRefund(delivered, "damaged", 4900, now, pair)).toEqual({ decision: "auto_approved", amountCents: 4900 });
    // Both lamps: still $49 items, but $98 on the order is over the $50 total, so it's queued.
    expect(decideRefund(delivered, "damaged", 9800, now, pair)).toMatchObject({ decision: "queued_for_approval", why: expect.stringMatching(/total \$98\.00/) });
    // A unit just over $50 goes to approval whatever is asked, and the reason names the unit price.
    const pricey: RefundItem = { name: "Stove", paidCents: 10002, qty: 2, refundableCents: 10002 };
    expect(decideRefund(delivered, "damaged", 100, now, pricey)).toMatchObject({ decision: "queued_for_approval", why: expect.stringMatching(/\$50\.01 each/) });
    // Exactly $50 a unit is still automatic (a $100 line of two).
    const atLimit: RefundItem = { name: "Stove", paidCents: 10000, qty: 2, refundableCents: 10000 };
    expect(decideRefund(delivered, "damaged", 5000, now, atLimit).decision).toBe("auto_approved");
  });

  it("refunds a lost order in full, via approval when over $50", () => {
    const lost = { ...delivered, status: "lost" as const, deliveredAt: null };
    expect(decideRefund(lost, "lost", 20000, now).decision).toBe("queued_for_approval");
  });

  it("limits a late-delivery refund to the shipping paid", () => {
    const delayed = { ...delivered, status: "delayed" as const, deliveredAt: null };
    expect(decideRefund(delayed, "late", 799, now).decision).toBe("auto_approved");
    expect(decideRefund(delayed, "late", 800, now)).toMatchObject({ code: "AMOUNT_EXCEEDS_REFUNDABLE" });
    expect(decideRefund({ ...delayed, shippingCents: 0 }, "late", 100, now)).toMatchObject({ code: "NOTHING_REFUNDABLE" });
  });

  it("the policy text says the $50 limit is per unit, with a $50 total per order", () => {
    const body = (topic: string) => POLICY_DOCS.find((d) => d.topic === topic)!.body;
    expect(body("refunds")).toContain("An item that cost more than $50.00 (per unit) is always reviewed");
    expect(body("damaged_items")).toContain("$50.00 or less per unit is refunded right away, as long as the order's refunds stay within $50.00 in total");
  });
});
