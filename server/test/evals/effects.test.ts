import { describe, expect, it } from "vitest";
import { effectsSince, snapshotStore } from "../../src/evals/grading/effects.ts";
import { MAYA, SOFIA, as, call, inTx } from "../helpers.ts";

describe("reading what a conversation changed in the store", () => {
  it("sees only new refunds, coupons and escalations, not the seeded ones", () =>
    inTx(async (tx) => {
      const snap = await snapshotStore(tx);
      expect(await effectsSince(tx, snap)).toEqual({ refunds: [], goodwill: [], escalations: 0 });

      await call(tx, "issue_refund", { orderId: 1050, amount: 29, reason: "damaged", cause: "arrived_damaged", item: "lamp-glowworm-300" }, as(MAYA));
      await call(tx, "issue_goodwill_coupon", { customer: "maya.chen@example.com", orderId: 1050, percent: 10, reason: "sorry" }, as(MAYA));
      // Sofia got one 10 days ago, so hers is queued.
      await call(tx, "issue_goodwill_coupon", { customer: "sofia.alvarez@example.com", percent: 10, reason: "sorry" }, as(SOFIA));
      await call(tx, "issue_refund", { orderId: 1055, amount: 50, reason: "lost" }, as(SOFIA)); // denied: #1055 is delayed, not lost
      await call(tx, "escalate_to_human", { reason: "customer asked" }, as(SOFIA));

      expect(await effectsSince(tx, snap)).toEqual({
        refunds: [{ order: 1050, amountCents: 2900, reason: "damaged", status: "issued", item: "lamp-glowworm-300" }],
        goodwill: [
          { percent: 10, status: "issued" },
          { percent: 10, status: "pending_approval" },
        ],
        escalations: 1,
      });
    }));

  it("reports queued refunds with their item, and order-level refunds without one", () =>
    inTx(async (tx) => {
      const snap = await snapshotStore(tx);
      await call(tx, "issue_refund", { orderId: 1051, amount: 179.99, reason: "damaged", cause: "arrived_damaged", item: "bag-harbor-double" }, as(3));
      await call(tx, "issue_refund", { orderId: 1055, amount: 7.99, reason: "late" }, as(SOFIA));
      expect((await effectsSince(tx, snap)).refunds).toEqual([
        { order: 1051, amountCents: 17999, reason: "damaged", status: "pending_approval", item: "bag-harbor-double" },
        { order: 1055, amountCents: 799, reason: "late", status: "issued", item: null },
      ]);
    }));
});
