import { describe, expect, it } from "vitest";
import { decideRefund, type RefundItem, type RefundOrderState } from "../../src/policy/refunds.ts";

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
const cheap: RefundItem = { name: "Headlamp", paidCents: 2900, refundableCents: 2900 };
const whole: RefundItem = { name: "Tent", paidCents: 20000, refundableCents: 20000 };

describe("decideRefund", () => {
  it("auto-approves a damaged item that cost up to and including $50", () => {
    expect(decideRefund(delivered, "damaged", 2900, now, cheap)).toEqual({ decision: "auto_approved", amountCents: 2900 });
    const fifty = { name: "Stove", paidCents: 5000, refundableCents: 5000 };
    expect(decideRefund(delivered, "damaged", 5000, now, fifty)).toEqual({ decision: "auto_approved", amountCents: 5000 });
  });

  it("a damaged item that cost over $50 always goes to approval, even for a small amount", () => {
    // Regression (2026-09-29): an agent refunded $50 of a $179.99 item automatically and escalated the rest.
    const bag = { name: "Harbor Double Sleeping Bag", paidCents: 17999, refundableCents: 17999 };
    expect(decideRefund(delivered, "damaged", 5000, now, bag)).toMatchObject({ decision: "queued_for_approval", why: expect.stringMatching(/\$179\.99/) });
    expect(decideRefund(delivered, "damaged", 100, now, bag).decision).toBe("queued_for_approval");
    const fiftyOne = { name: "Stove", paidCents: 5001, refundableCents: 5001 };
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
});
