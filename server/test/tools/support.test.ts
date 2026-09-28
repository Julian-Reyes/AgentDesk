import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as s from "../../src/db/schema.ts";
import { as, call, DANIEL, inTx, MAYA, PRIYA, SOFIA, TOM } from "../helpers.ts";

describe("order ownership", () => {
  it("a customer can read their own order", () =>
    inTx(async (tx) => {
      const r = await call(tx, "get_order", { orderId: "#1042" }, as(MAYA));
      expect(r).toMatchObject({ ok: true, data: { number: 1042, status: "shipped" } });
    }));

  it("someone else's order looks exactly like a missing one", () =>
    inTx(async (tx) => {
      const other = await call(tx, "get_order", { orderId: 1043 }, as(MAYA));
      const missing = await call(tx, "get_order", { orderId: 9999 }, as(MAYA));
      expect(other).toMatchObject({ ok: false, error: { code: "ORDER_NOT_FOUND" } });
      expect(missing).toMatchObject({ ok: false, error: { code: "ORDER_NOT_FOUND" } });
      expect(JSON.stringify(other).replace("1043", "N")).toBe(JSON.stringify(missing).replace("9999", "N"));
    }));

  it("every order tool requires a signed-in customer", () =>
    inTx(async (tx) => {
      for (const [name, args] of [
        ["get_order", { orderId: 1042 }],
        ["get_tracking", { orderId: 1042 }],
        ["check_return_eligibility", { orderId: 1042, item: "tent" }],
        ["issue_refund", { orderId: 1042, amount: 10, reason: "damaged" }],
        ["find_customer", { email: "maya.chen@example.com" }],
      ] as const) {
        expect(await call(tx, name, args), name).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
      }
    }));

  it("tracking and refunds also refuse another customer's order", () =>
    inTx(async (tx) => {
      expect(await call(tx, "get_tracking", { orderId: 1043 }, as(MAYA))).toMatchObject({ error: { code: "ORDER_NOT_FOUND" } });
      expect(await call(tx, "issue_refund", { orderId: 1051, amount: 10, reason: "damaged" }, as(MAYA))).toMatchObject({
        error: { code: "ORDER_NOT_FOUND" },
      });
    }));

  it("find_customer only returns the signed-in account", () =>
    inTx(async (tx) => {
      const own = await call(tx, "find_customer", { email: " Maya.Chen@example.com " }, as(MAYA));
      expect(own).toMatchObject({ ok: true, data: { name: "Maya Chen" } });
      expect((own as any).data.orders.map((o: any) => o.number)).toEqual(expect.arrayContaining([1042, 1050]));

      const other = await call(tx, "find_customer", { email: "daniel.okafor@example.com" }, as(MAYA));
      const nobody = await call(tx, "find_customer", { email: "nobody@example.com" }, as(MAYA));
      expect(other).toMatchObject({ ok: false, error: { code: "NOT_SIGNED_IN_ACCOUNT" } });
      expect(other).toEqual(nobody);
    }));
});

describe("get_order / get_tracking", () => {
  it("shows items and amounts as formatted dollars", () =>
    inTx(async (tx) => {
      const r = await call(tx, "get_order", { orderId: 1050 }, as(MAYA));
      expect(r).toMatchObject({
        ok: true,
        data: { items: [{ name: "Glowworm 300 Headlamp", qty: 1, unitPrice: "$29.00" }], shipping: "$7.99", totalPaid: "$36.99" },
      });
    }));

  it("returns tracking events in time order", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "get_tracking", { orderId: 1042 }, as(MAYA))) as any;
      expect(r.ok).toBe(true);
      expect(r.data.carrier).toBe("Parcelway");
      expect(r.data.events.map((e: any) => e.status)).toEqual(["order_placed", "shipped", "in_transit"]);
      expect(r.data.estimatedDelivery).toMatch(/^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/);
    }));

  it("a processing order has no carrier yet", () =>
    inTx(async (tx) => {
      const r = await call(tx, "get_tracking", { orderId: 1056 }, as(SOFIA));
      expect(r).toMatchObject({ ok: true, data: { carrier: null, trackingNumber: null } });
    }));
});

describe("check_return_eligibility", () => {
  it("unused item within the window is eligible", () =>
    inTx(async (tx) => {
      const r = await call(tx, "check_return_eligibility", { orderId: 1053, item: "ridgeline mid", condition: "unused" }, as(TOM));
      expect(r).toMatchObject({ ok: true, data: { eligible: true, item: "Ridgeline Mid Hiking Boot" } });
    }));

  it("boots worn once are not returnable", () =>
    inTx(async (tx) => {
      const r = await call(tx, "check_return_eligibility", { orderId: 1053, item: "boot-ridgeline-mid", condition: "used" }, as(TOM));
      expect(r).toMatchObject({ ok: true, data: { eligible: false, code: "ITEM_USED" }, policyDecision: "denied" });
    }));

  it("delivered 45 days ago is outside the window", () =>
    inTx(async (tx) => {
      const r = await call(tx, "check_return_eligibility", { orderId: 1052, item: "Ridgeline Low Hiking Shoe" }, as(PRIYA));
      expect(r).toMatchObject({ ok: true, data: { eligible: false, code: "WINDOW_EXPIRED" } });
    }));

  it("an item not in the order lists what is", () =>
    inTx(async (tx) => {
      const r = await call(tx, "check_return_eligibility", { orderId: 1053, item: "tent" }, as(TOM));
      expect(r).toMatchObject({ ok: false, error: { code: "ITEM_NOT_IN_ORDER", details: { itemsInOrder: [{ productId: "boot-ridgeline-mid" }] } } });
    }));
});

describe("issue_refund", () => {
  const refundsFor = (tx: any, n: number) => tx.select().from(s.refunds).where(eq(s.refunds.orderNumber, n));
  const approvalsFor = (tx: any, n: number) => tx.select().from(s.approvals).where(eq(s.approvals.orderNumber, n));

  it("refunds a $29 damaged item immediately", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_refund", { orderId: 1050, amount: 29, reason: "damaged" }, as(MAYA));
      expect(r).toMatchObject({ ok: true, policyDecision: "auto_approved", data: { status: "refunded", amount: "$29.00" } });
      expect(await refundsFor(tx, 1050)).toMatchObject([{ amountCents: 2900, status: "issued", reason: "damaged" }]);
    }));

  it("sends $179.99 to the approvals queue and refunds nothing", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_refund", { orderId: 1051, amount: 179.99, reason: "damaged" }, as(PRIYA));
      expect(r).toMatchObject({ ok: true, policyDecision: "queued_for_approval", data: { status: "pending_approval" } });
      expect(await approvalsFor(tx, 1051)).toMatchObject([{ kind: "refund", status: "pending", payload: { amountCents: 17999 } }]);
      const refunds = await refundsFor(tx, 1051);
      expect(refunds).toMatchObject([{ status: "pending_approval" }]);
      expect(refunds.some((x: any) => x.status === "issued")).toBe(false);
    }));

  it("can't be split into small refunds to dodge the limit", () =>
    inTx(async (tx) => {
      const first = await call(tx, "issue_refund", { orderId: 1051, amount: 45, reason: "damaged" }, as(PRIYA));
      const second = await call(tx, "issue_refund", { orderId: 1051, amount: 45, reason: "damaged" }, as(PRIYA));
      expect(first).toMatchObject({ policyDecision: "auto_approved" });
      expect(second).toMatchObject({ policyDecision: "queued_for_approval" });
    }));

  it("never refunds more than was paid", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_refund", { orderId: 1050, amount: 500, reason: "damaged" }, as(MAYA));
      expect(r).toMatchObject({ ok: false, policyDecision: "denied", error: { code: "AMOUNT_EXCEEDS_REFUNDABLE", details: { maxRefundable: "$36.99" } } });
      expect(await refundsFor(tx, 1050)).toEqual([]);
    }));

  it("won't refund an already-refunded return again", () =>
    inTx(async (tx) => {
      // #1057 was returned; the $69 item was refunded, only the $7.99 shipping remains.
      const r = await call(tx, "issue_refund", { orderId: 1057, amount: 69, reason: "damaged" }, as(DANIEL));
      expect(r).toMatchObject({ ok: false, policyDecision: "denied" });
    }));

  it("reason must match the order: 'lost' on a lost order, not a delivered one", () =>
    inTx(async (tx) => {
      expect(await call(tx, "issue_refund", { orderId: 1050, amount: 10, reason: "lost" }, as(MAYA))).toMatchObject({
        error: { code: "REASON_DOES_NOT_MATCH_ORDER" },
      });
      expect(await call(tx, "issue_refund", { orderId: 1054, amount: 199, reason: "lost" }, as(TOM))).toMatchObject({
        policyDecision: "queued_for_approval",
      });
    }));

  it("a late order gets its shipping back, and no more", () =>
    inTx(async (tx) => {
      expect(await call(tx, "issue_refund", { orderId: 1055, amount: 8, reason: "late" }, as(SOFIA))).toMatchObject({
        error: { code: "AMOUNT_EXCEEDS_REFUNDABLE" },
      });
      expect(await call(tx, "issue_refund", { orderId: 1055, amount: 7.99, reason: "late" }, as(SOFIA))).toMatchObject({
        policyDecision: "auto_approved",
      });
    }));

  it("rejects bad arguments before any rule runs", () =>
    inTx(async (tx) => {
      for (const args of [
        { orderId: 1050, amount: -5, reason: "damaged" },
        { orderId: 1050, amount: 10.001, reason: "damaged" },
        { orderId: 1050, amount: 10, reason: "return" },
        { orderId: 1050, amount: 10, reason: "because I said so" },
        { orderId: "abc", amount: 10, reason: "damaged" },
      ]) {
        expect(await call(tx, "issue_refund", args, as(MAYA)), JSON.stringify(args)).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
      }
    }));
});

describe("issue_goodwill_coupon", () => {
  it("issues up to 10% immediately, as a single-use code for that customer", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "issue_goodwill_coupon", { customer: "maya.chen@example.com", percent: 10, reason: "late order" }, as(MAYA))) as any;
      expect(r).toMatchObject({ ok: true, policyDecision: "auto_approved", data: { status: "issued", percentOff: 10 } });
      const [coupon] = await tx.select().from(s.coupons).where(eq(s.coupons.code, r.data.code));
      expect(coupon).toMatchObject({ customerId: MAYA, singleUse: true, source: "goodwill", value: 10 });
    }));

  it("queues 15% for approval", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_goodwill_coupon", { customer: "maya.chen@example.com", percent: 15, reason: "damaged gear" }, as(MAYA));
      expect(r).toMatchObject({ policyDecision: "queued_for_approval", data: { status: "pending_approval" } });
    }));

  it("queues a second coupon within 30 days (Sofia got one 10 days ago)", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_goodwill_coupon", { customer: "sofia.alvarez@example.com", percent: 5, reason: "delay" }, as(SOFIA));
      expect(r).toMatchObject({ policyDecision: "queued_for_approval" });
    }));

  it("only for the signed-in customer", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_goodwill_coupon", { customer: "daniel.okafor@example.com", percent: 5, reason: "x y z" }, as(MAYA));
      expect(r).toMatchObject({ ok: false, error: { code: "NOT_SIGNED_IN_ACCOUNT" } });
    }));

  it("the issued code works in quote_price for its owner only", () =>
    inTx(async (tx) => {
      const issued = (await call(tx, "issue_goodwill_coupon", { customer: "maya.chen@example.com", percent: 10, reason: "sorry" }, as(MAYA))) as any;
      const cart = [{ productId: "stove-quickboil", qty: 1 }];
      expect(await call(tx, "quote_price", { cart, coupon: issued.data.code }, as(MAYA))).toMatchObject({
        data: { coupon: { applied: true, discount: "-$12.90" } },
      });
      expect(await call(tx, "quote_price", { cart, coupon: issued.data.code }, as(DANIEL))).toMatchObject({
        data: { coupon: { applied: false, reason: "NOT_FOUND" } },
      });
    }));
});

describe("escalate_to_human", () => {
  it("records an escalation and returns a ticket", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "escalate_to_human", { reason: "Customer wants a warranty claim", orderId: 1053 }, as(TOM))) as any;
      expect(r).toMatchObject({ ok: true, data: { ticket: expect.stringMatching(/^ESC-\d+$/) } });
      const rows = await tx.select().from(s.escalations);
      expect(rows).toMatchObject([{ customerId: TOM, orderNumber: 1053 }]);
    }));

  it("doesn't attach someone else's order", () =>
    inTx(async (tx) => {
      await call(tx, "escalate_to_human", { reason: "wants order 1043", orderId: 1043 }, as(MAYA));
      const rows = await tx.select().from(s.escalations);
      expect(rows).toMatchObject([{ customerId: MAYA, orderNumber: null }]);
    }));
});
