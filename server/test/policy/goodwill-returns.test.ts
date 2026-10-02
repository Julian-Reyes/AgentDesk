import { describe, expect, it } from "vitest";
import { decideGoodwill, STORE_CAUSED_PROBLEMS, storeCausedProblem } from "../../src/policy/goodwill.ts";
import { RULES } from "../../src/policy/rules.ts";
import { POLICY_DOCS } from "../../src/seed/policies.ts";
import { checkReturnEligibility } from "../../src/policy/returns.ts";

const now = new Date("2026-09-15T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("decideGoodwill", () => {
  const fresh = { lastIssuedAt: null, hasPending: false };

  it("auto-approves up to 10% for a store-caused problem", () => {
    for (const problem of ["lost", "late", "damaged"] as const) expect(decideGoodwill(10, problem, fresh, now).decision).toBe("auto_approved");
  });
  it("queues 11% and above", () => {
    expect(decideGoodwill(11, "lost", fresh, now).decision).toBe("queued_for_approval");
  });
  it("queues any coupon without a store-caused problem, even 1%", () => {
    expect(decideGoodwill(1, null, fresh, now)).toEqual({
      decision: "queued_for_approval",
      why: "Goodwill is automatic only for a store-caused problem with an order (lost, delayed or damaged); this request names none.",
    });
  });
  it("queues a second coupon within 30 days", () => {
    expect(decideGoodwill(5, "late", { lastIssuedAt: daysAgo(29), hasPending: false }, now).decision).toBe("queued_for_approval");
  });
  it("allows one again after 30 days", () => {
    expect(decideGoodwill(5, "late", { lastIssuedAt: daysAgo(30), hasPending: false }, now).decision).toBe("auto_approved");
    expect(decideGoodwill(5, "late", { lastIssuedAt: daysAgo(31), hasPending: false }, now).decision).toBe("auto_approved");
  });
  it("queues when a request is already pending", () => {
    expect(decideGoodwill(5, "late", { lastIssuedAt: null, hasPending: true }, now).decision).toBe("queued_for_approval");
  });
});

describe("storeCausedProblem", () => {
  it("reads lost and delayed orders from their status", () => {
    expect(storeCausedProblem({ status: "lost", refundReasons: [] })).toBe("lost");
    expect(storeCausedProblem({ status: "delayed", refundReasons: [] })).toBe("late");
  });
  it("reads damage (and a late order since delivered) from the order's refunds", () => {
    expect(storeCausedProblem({ status: "delivered", refundReasons: ["damaged"] })).toBe("damaged");
    expect(storeCausedProblem({ status: "delivered", refundReasons: ["late"] })).toBe("late");
  });
  it("finds none for customer-side situations", () => {
    for (const status of ["processing", "shipped", "delivered", "returned"] as const) {
      expect(storeCausedProblem({ status, refundReasons: [] }), status).toBeNull();
    }
    // A return refund is the customer's own return, not a store problem.
    expect(storeCausedProblem({ status: "returned", refundReasons: ["return"] })).toBeNull();
  });
});

describe("the goodwill policy text", () => {
  it("is generated from the same rule and limits the tool enforces", () => {
    const body = POLICY_DOCS.find((d) => d.topic === "goodwill")!.body;
    for (const label of Object.values(STORE_CAUSED_PROBLEMS)) expect(body).toContain(label);
    expect(body).toContain(`up to ${RULES.goodwillMaxPercent}%`);
    expect(body).toContain(`every ${RULES.goodwillCooldownDays} days`);
    expect(body).toContain(`after ${RULES.goodwillExpiryDays} days`);
    expect(body).toContain("don't qualify");
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
  it("counts the return window in calendar days, so it agrees with the return-by date", () => {
    // Store "now" is noon on Sep 15. Delivered Aug 15 in the afternoon: 31 calendar days,
    // window ended Sep 14 (it used to say "eligible until 2026-09-14", a date already past).
    const aug15 = checkReturnEligibility({ orderStatus: "delivered", deliveredAt: new Date("2026-08-15T15:00:00Z"), item, now });
    expect(aug15).toMatchObject({ eligible: false, code: "WINDOW_EXPIRED", details: { returnBy: "2026-09-14", daysSinceDelivery: 31 } });
    // Delivered Aug 16 late at night: day 30, today is the last day.
    const aug16 = checkReturnEligibility({ orderStatus: "delivered", deliveredAt: new Date("2026-08-16T23:30:00Z"), item, now });
    expect(aug16).toMatchObject({ eligible: true, returnBy: "2026-09-15" });
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
