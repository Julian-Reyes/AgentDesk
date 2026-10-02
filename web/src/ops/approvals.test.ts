import { describe, expect, it } from "vitest";
import { dollars, noteProblem, requestSummary, when } from "./approvals.ts";

describe("approvals display", () => {
  it("formats cents", () => {
    expect([dollars(17999), dollars(5), dollars(123456)]).toEqual(["$179.99", "$0.05", "$1,234.56"]);
  });

  it("summarizes each kind of request", () => {
    expect(requestSummary({ kind: "refund", amountCents: 17999, percent: null, item: "Harbor Bag", refundReason: "damaged" })).toBe("$179.99 refund, damaged: Harbor Bag");
    expect(requestSummary({ kind: "refund", amountCents: 19900, percent: null, item: null, refundReason: "lost" })).toBe("$199.00 refund, lost");
    expect(requestSummary({ kind: "goodwill_coupon", amountCents: null, percent: 20, item: null, refundReason: null })).toBe("20% goodwill coupon");
  });

  it("explains a missing rejection note before sending; approving needs none", () => {
    expect(noteProblem("reject", "")).toMatch(/why/);
    expect(noteProblem("reject", "  no ")).toMatch(/why/);
    expect(noteProblem("reject", "No photo")).toBeNull();
    expect(noteProblem("approve", "")).toBeNull();
    expect(noteProblem("approve", "x".repeat(1001))).toMatch(/1,000/);
  });

  it("shows times in UTC", () => {
    expect(when("2026-10-02T15:30:12.000Z")).toBe("2026-10-02 15:30 UTC");
  });
});
