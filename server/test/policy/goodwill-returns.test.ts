import { describe, expect, it } from "vitest";
import { decideGoodwill } from "../../src/policy/goodwill.ts";
import { checkReturnEligibility } from "../../src/policy/returns.ts";

const now = new Date("2026-09-15T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("decideGoodwill", () => {
  const fresh = { lastIssuedAt: null, hasPending: false };

  it("auto-approves up to 10%", () => {
    expect(decideGoodwill(10, fresh, now).decision).toBe("auto_approved");
  });
  it("queues 11% and above", () => {
    expect(decideGoodwill(11, fresh, now).decision).toBe("queued_for_approval");
  });
  it("queues a second coupon within 30 days", () => {
    expect(decideGoodwill(5, { lastIssuedAt: daysAgo(29), hasPending: false }, now).decision).toBe("queued_for_approval");
  });
  it("allows one again after 30 days", () => {
    expect(decideGoodwill(5, { lastIssuedAt: daysAgo(30), hasPending: false }, now).decision).toBe("auto_approved");
    expect(decideGoodwill(5, { lastIssuedAt: daysAgo(31), hasPending: false }, now).decision).toBe("auto_approved");
  });
  it("queues when a request is already pending", () => {
    expect(decideGoodwill(5, { lastIssuedAt: null, hasPending: true }, now).decision).toBe("queued_for_approval");
  });
});

describe("checkReturnEligibility", () => {
  const item = { qty: 1, returnedQty: 0 };
  const deliveredDaysAgo = (n: number) => ({ orderStatus: "delivered" as const, deliveredAt: daysAgo(n), item, now });

  it("is eligible on day 30", () => {
    expect(checkReturnEligibility(deliveredDaysAgo(30))).toMatchObject({ eligible: true, returnBy: "2026-09-15" });
  });
  it("is not eligible on day 31", () => {
    expect(checkReturnEligibility(deliveredDaysAgo(31))).toMatchObject({ eligible: false, code: "WINDOW_EXPIRED" });
  });
  it("rejects used items", () => {
    expect(checkReturnEligibility({ ...deliveredDaysAgo(5), condition: "used" })).toMatchObject({ code: "ITEM_USED" });
  });
  it("routes damaged items to the damaged-items process", () => {
    expect(checkReturnEligibility({ ...deliveredDaysAgo(5), condition: "damaged" })).toMatchObject({
      code: "USE_DAMAGED_ITEM_PROCESS",
      details: { withinDamageWindow: true },
    });
  });
  it("rejects items already returned", () => {
    expect(checkReturnEligibility({ ...deliveredDaysAgo(5), item: { qty: 2, returnedQty: 2 } })).toMatchObject({ code: "ALREADY_RETURNED" });
  });
  it("rejects orders not yet delivered", () => {
    expect(checkReturnEligibility({ orderStatus: "shipped", deliveredAt: null, item, now })).toMatchObject({ code: "NOT_DELIVERED_YET" });
  });
  it("points lost orders at the lost-order refund", () => {
    expect(checkReturnEligibility({ orderStatus: "lost", deliveredAt: null, item, now })).toMatchObject({ code: "ORDER_LOST" });
  });
});
