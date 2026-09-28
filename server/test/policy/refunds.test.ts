import { describe, expect, it } from "vitest";
import { decideRefund, type RefundOrderState } from "../../src/policy/refunds.ts";

const now = new Date("2026-09-15T12:00:00Z");
const delivered: RefundOrderState = {
  status: "delivered",
  deliveredAt: new Date("2026-09-10T12:00:00Z"),
  shippingCents: 799,
  totalPaidCents: 20000,
  issuedCents: 0,
  pendingCents: 0,
};

describe("decideRefund", () => {
  it("auto-approves up to and including $50", () => {
    expect(decideRefund(delivered, "damaged", 2900, now)).toEqual({ decision: "auto_approved", amountCents: 2900 });
    expect(decideRefund(delivered, "damaged", 5000, now)).toEqual({ decision: "auto_approved", amountCents: 5000 });
  });

  it("queues $50.01 and above for approval", () => {
    expect(decideRefund(delivered, "damaged", 5001, now).decision).toBe("queued_for_approval");
    expect(decideRefund(delivered, "damaged", 18000, now).decision).toBe("queued_for_approval");
  });

  it("counts earlier refunds, so a big refund can't be split into small ones", () => {
    const afterOne = { ...delivered, issuedCents: 4500 };
    expect(decideRefund(afterOne, "damaged", 4500, now).decision).toBe("queued_for_approval");
  });

  it("counts pending refunds against both the limit and the cap", () => {
    const pending = { ...delivered, pendingCents: 18000 };
    expect(decideRefund(pending, "damaged", 1000, now).decision).toBe("queued_for_approval");
    expect(decideRefund(pending, "damaged", 2001, now)).toMatchObject({ decision: "denied", code: "AMOUNT_EXCEEDS_REFUNDABLE" });
  });

  it("never refunds more than the order paid", () => {
    expect(decideRefund(delivered, "damaged", 20001, now)).toMatchObject({
      decision: "denied",
      code: "AMOUNT_EXCEEDS_REFUNDABLE",
      details: { maxRefundableCents: 20000 },
    });
  });

  it("denies when everything has already been refunded", () => {
    expect(decideRefund({ ...delivered, issuedCents: 20000 }, "damaged", 100, now)).toMatchObject({
      decision: "denied",
      code: "NOTHING_REFUNDABLE",
    });
  });

  it("rejects zero, negative and fractional amounts", () => {
    for (const amount of [0, -100, 10.5]) {
      expect(decideRefund(delivered, "damaged", amount, now)).toMatchObject({ decision: "denied", code: "INVALID_AMOUNT" });
    }
  });

  it("requires the reason to match the order state", () => {
    expect(decideRefund(delivered, "lost", 1000, now)).toMatchObject({ code: "REASON_DOES_NOT_MATCH_ORDER" });
    expect(decideRefund(delivered, "late", 500, now)).toMatchObject({ code: "REASON_DOES_NOT_MATCH_ORDER" });
    expect(decideRefund({ ...delivered, status: "shipped", deliveredAt: null }, "damaged", 500, now)).toMatchObject({
      code: "REASON_DOES_NOT_MATCH_ORDER",
    });
  });

  it("allows damage reports up to day 14 after delivery, not day 15", () => {
    const d14 = { ...delivered, deliveredAt: new Date("2026-09-01T12:00:00Z") };
    const d15 = { ...delivered, deliveredAt: new Date("2026-08-31T12:00:00Z") };
    expect(decideRefund(d14, "damaged", 1000, now).decision).toBe("auto_approved");
    expect(decideRefund(d15, "damaged", 1000, now)).toMatchObject({ code: "DAMAGE_REPORT_WINDOW_EXPIRED" });
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
