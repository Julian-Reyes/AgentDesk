import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as s from "../../src/db/schema.ts";
import type { Tx } from "../../src/db/client.ts";
import { addDays } from "../../src/domain/clock.ts";
import { as, call, DANIEL, inTx, MAYA, PRIYA, SOFIA, TEST_NOW, TOM } from "../helpers.ts";

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
        ["issue_refund", { orderId: 1042, amount: 10, reason: "damaged", item: "tent" }],
        ["find_customer", { email: "maya.chen@example.com" }],
      ] as const) {
        expect(await call(tx, name, args), name).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
      }
    }));

  it("tracking and refunds also refuse another customer's order", () =>
    inTx(async (tx) => {
      expect(await call(tx, "get_tracking", { orderId: 1043 }, as(MAYA))).toMatchObject({ error: { code: "ORDER_NOT_FOUND" } });
      expect(await call(tx, "issue_refund", { orderId: 1051, amount: 10, reason: "damaged", item: "sleeping bag" }, as(MAYA))).toMatchObject({
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
        data: {
          items: [{ name: "Glowworm 300 Headlamp", qty: 1, listPrice: "$29.00", discount: "$0.00", paid: "$29.00" }],
          shipping: "$7.99",
          totalPaid: "$36.99",
        },
      });
    }));

  it("shows what was actually paid for an item bought on sale (#1042, tent sale)", () =>
    inTx(async (tx) => {
      const r = await call(tx, "get_order", { orderId: 1042 }, as(MAYA));
      expect(r).toMatchObject({
        ok: true,
        data: {
          items: [{ name: "Canopy 2 Trail Tent", qty: 1, listPrice: "$189.00", discount: "$37.80", paid: "$151.20" }],
          subtotal: "$189.00",
          discount: "$37.80",
          totalPaid: "$151.20",
        },
      });
      expect((r as any).data.items[0]).not.toHaveProperty("unitPrice");
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
      const r = await call(tx, "issue_refund", { orderId: 1050, amount: 29, reason: "damaged", item: "headlamp" }, as(MAYA));
      expect(r).toMatchObject({ ok: true, policyDecision: "auto_approved", data: { status: "refunded", amount: "$29.00" } });
      const [refund] = await refundsFor(tx, 1050);
      expect(refund).toMatchObject({ amountCents: 2900, status: "issued", reason: "damaged" });
      expect(refund.orderItemId).toEqual(expect.any(Number)); // recorded against the item
    }));

  it("sends $179.99 to the approvals queue and refunds nothing", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_refund", { orderId: 1051, amount: 179.99, reason: "damaged", item: "Harbor" }, as(PRIYA));
      expect(r).toMatchObject({ ok: true, policyDecision: "queued_for_approval", data: { status: "pending_approval" } });
      expect(await approvalsFor(tx, 1051)).toMatchObject([{ kind: "refund", status: "pending", payload: { amountCents: 17999, item: "Harbor 3°C Double Sleeping Bag" } }]);
      const refunds = await refundsFor(tx, 1051);
      expect(refunds).toMatchObject([{ status: "pending_approval" }]);
      expect(refunds.some((x: any) => x.status === "issued")).toBe(false);
    }));

  it("can't be split into small refunds to dodge the limit", () =>
    inTx(async (tx) => {
      // Rule change (2026-09-29): the bag cost $179.99, so even the first $45 now goes to approval.
      // Before, the first $45 was automatic; an agent used that to split a claim into "$50 now + escalate".
      const first = await call(tx, "issue_refund", { orderId: 1051, amount: 45, reason: "damaged", item: "sleeping bag" }, as(PRIYA));
      const second = await call(tx, "issue_refund", { orderId: 1051, amount: 45, reason: "damaged", item: "sleeping bag" }, as(PRIYA));
      expect(first).toMatchObject({ policyDecision: "queued_for_approval" });
      expect(second).toMatchObject({ policyDecision: "queued_for_approval" });
      expect((await refundsFor(tx, 1051)).some((x: any) => x.status === "issued")).toBe(false);
    }));

  it("multi-item order: each item is under $50, but once the order's refunds pass $50 the rest goes to approval", () =>
    inTx(async (tx) => {
      // Found by query rather than hard-coded, so a seed change fails loudly here instead of testing nothing.
      // (Today it's #1096: a $29.00 headlamp + a $44.00 lantern headlamp.)
      const { rows } = await tx.execute<{ number: number; customer_id: number }>(sql`
        select o.number, o.customer_id
        from ${s.orders} o join ${s.orderItems} i on i.order_number = o.number
        where o.status = 'delivered'
        group by o.number
        having count(*) >= 2
           and max(i.unit_price_cents * i.qty - i.discount_cents) <= 5000
           and sum(i.unit_price_cents * i.qty - i.discount_cents) > 5000
        order by o.number limit 1`);
      expect(rows, "the seed needs a delivered order with 2+ items each ≤ $50 totalling > $50").toHaveLength(1);
      const { number, customer_id: customerId } = rows[0]!;
      const lines = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderNumber, number)).orderBy(s.orderItems.id);
      const paid = (l: (typeof lines)[number]) => (l.unitPriceCents * l.qty - l.discountCents) / 100;
      const [a, b] = lines as [(typeof lines)[number], (typeof lines)[number]];
      expect(paid(a) + paid(b)).toBeGreaterThan(50);

      // Move the delivery inside the 14-day damage window (rolled back with the transaction).
      await tx.update(s.orders).set({ deliveredAt: addDays(TEST_NOW, -5) }).where(eq(s.orders.number, number));

      const first = await call(tx, "issue_refund", { orderId: number, amount: paid(a), reason: "damaged", item: a.productId }, as(customerId));
      expect(first).toMatchObject({ ok: true, policyDecision: "auto_approved", data: { status: "refunded" } });

      // Item B is under $50 on its own, but the order's refunds would total more than $50.
      const second = await call(tx, "issue_refund", { orderId: number, amount: paid(b), reason: "damaged", item: b.productId }, as(customerId));
      expect(second).toMatchObject({ ok: true, policyDecision: "queued_for_approval", data: { status: "pending_approval" } });

      const [approval] = await approvalsFor(tx, number);
      expect(approval).toMatchObject({ kind: "refund", status: "pending", payload: { orderItemId: b.id } });
      expect(approval.reason).toMatch(/Refunds on this order would total \$\d+\.\d\d, above the \$50\.00 automatic limit/);
      const refunds = await refundsFor(tx, number);
      expect(refunds.map((r: any) => [r.orderItemId, r.status]).sort()).toEqual(
        [[a.id, "issued"], [b.id, "pending_approval"]].sort(),
      );
    }));

  it("units already returned (refunded by the warehouse) can't also be refunded as damaged", () =>
    inTx(async (tx) => {
      await tx.update(s.orderItems).set({ returnedQty: 1 }).where(eq(s.orderItems.orderNumber, 1050));
      expect(await call(tx, "issue_refund", { orderId: 1050, amount: 29, reason: "damaged", item: "headlamp" }, as(MAYA))).toMatchObject({
        ok: false, error: { code: "NOTHING_REFUNDABLE" },
      });
    }));

  it("the exact split from the 2026-09-29 chat ($50 of a $179.99 item) goes to approval", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_refund", { orderId: 1051, amount: 50, reason: "damaged", item: "Harbor 3°C Double Sleeping Bag" }, as(PRIYA));
      expect(r).toMatchObject({ policyDecision: "queued_for_approval", data: { status: "pending_approval" } });
    }));

  it("a damaged refund must name an item that is in the order", () =>
    inTx(async (tx) => {
      expect(await call(tx, "issue_refund", { orderId: 1050, amount: 29, reason: "damaged" }, as(MAYA))).toMatchObject({
        ok: false, policyDecision: "denied", error: { code: "ITEM_REQUIRED" },
      });
      expect(await call(tx, "issue_refund", { orderId: 1050, amount: 29, reason: "damaged", item: "tent" }, as(MAYA))).toMatchObject({
        ok: false, policyDecision: "denied", error: { code: "ITEM_NOT_IN_ORDER", details: { itemsInOrder: [{ name: "Glowworm 300 Headlamp" }] } },
      });
      expect(await refundsFor(tx, 1050)).toEqual([]);
    }));

  it("refunds for one item add up: a second claim on the same item can't exceed what's left", () =>
    inTx(async (tx) => {
      expect(await call(tx, "issue_refund", { orderId: 1050, amount: 20, reason: "damaged", item: "headlamp" }, as(MAYA))).toMatchObject({ policyDecision: "auto_approved" });
      expect(await call(tx, "issue_refund", { orderId: 1050, amount: 10, reason: "damaged", item: "headlamp" }, as(MAYA))).toMatchObject({
        error: { code: "AMOUNT_EXCEEDS_REFUNDABLE", details: { maxRefundable: "$9.00" } },
      });
    }));

  it("never refunds more than was paid", () =>
    inTx(async (tx) => {
      // Rule change (2026-09-29): a damaged refund is capped at the item ($29.00), not the order total with shipping ($36.99).
      const r = await call(tx, "issue_refund", { orderId: 1050, amount: 500, reason: "damaged", item: "headlamp" }, as(MAYA));
      expect(r).toMatchObject({ ok: false, policyDecision: "denied", error: { code: "AMOUNT_EXCEEDS_REFUNDABLE", details: { maxRefundable: "$29.00" } } });
      expect(await refundsFor(tx, 1050)).toEqual([]);
    }));

  it("won't refund an already-refunded return again", () =>
    inTx(async (tx) => {
      // #1057 was returned; the $69 item was refunded, only the $7.99 shipping remains.
      // Named precisely so the denial is about the refund, not "item not found".
      const r = await call(tx, "issue_refund", { orderId: 1057, amount: 69, reason: "damaged", item: "fleece" }, as(DANIEL));
      expect(r).toMatchObject({ ok: false, policyDecision: "denied" });
      expect((r as any).error.code).not.toBe("ITEM_NOT_IN_ORDER");
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

describe("finding the item in a multi-item order (#1074: Voyager 80 pack, Squall jacket, Firefly Kids Headlamp)", () => {
  /** Rowan Brennan's id, from the seed. */
  const owner = async (tx: Tx) => (await tx.select({ id: s.orders.customerId }).from(s.orders).where(eq(s.orders.number, 1074)))[0]!.id;
  const refundFor = async (tx: Tx, item: string) => call(tx, "issue_refund", { orderId: 1074, amount: 14.99, reason: "damaged", item }, as(await owner(tx)));
  const refundedItem = async (tx: Tx) => {
    const rows = await tx.select({ product: s.orderItems.productId }).from(s.refunds).innerJoin(s.orderItems, eq(s.orderItems.id, s.refunds.orderItemId)).where(eq(s.refunds.orderNumber, 1074));
    return rows.map((r) => r.product);
  };

  it("accepts the product id, the full name in any case or quoted, and a short name; each picks the Firefly line", async () => {
    for (const item of ["lamp-firefly-kids", "Firefly Kids Headlamp", "firefly kids headlamp", '"Firefly Kids Headlamp"', "Firefly", "firefly headlamp", "kids headlamps"]) {
      await inTx(async (tx) => {
        expect(await refundFor(tx, item), item).toMatchObject({ ok: true, data: { status: "refunded", amount: "$14.99" } });
        expect(await refundedItem(tx)).toEqual(["lamp-firefly-kids"]);
      });
    }
  });

  it("refuses a garbled item string (the dev-1 refund-within-limit-01 call) and a fragment of a word, listing the items, with no refund made", () =>
    inTx(async (tx) => {
      for (const item of ['"Firefly Kids Headlamp" OR "lamp-firefly-kids" (arrived damaged: cracked lens, will not turn on)', "lamp", "headlamp that is broken", "item"]) {
        const r = (await refundFor(tx, item)) as any;
        expect(r, item).toMatchObject({ ok: false, policyDecision: "denied", error: { code: "ITEM_NOT_IN_ORDER" } });
        expect(r.error.details.itemsInOrder.map((i: { productId: string }) => i.productId).sort()).toEqual(["jacket-squall", "lamp-firefly-kids", "pack-voyager-80"]);
      }
      expect(await refundedItem(tx)).toEqual([]);
    }));

  it("a short name that fits two lines is ambiguous", () =>
    inTx(async (tx) => {
      // Add a second headlamp line to #1074, so "headlamp" fits two items.
      const [line] = await tx.select().from(s.orderItems).where(and(eq(s.orderItems.orderNumber, 1074), eq(s.orderItems.productId, "lamp-firefly-kids")));
      await tx.insert(s.orderItems).values({ ...line!, id: 999_999, productId: "lamp-glowworm-300", variantId: "lamp-glowworm-300/black" });
      expect(await refundFor(tx, "headlamp")).toMatchObject({ ok: false, error: { code: "ITEM_AMBIGUOUS" } });
      expect(await refundFor(tx, "Firefly")).toMatchObject({ ok: true });
    }));

  it("check_return_eligibility uses the same matching, plurals included", () =>
    inTx(async (tx) => {
      expect(await call(tx, "check_return_eligibility", { orderId: 1053, item: "boots" }, as(TOM))).toMatchObject({ ok: true });
      expect(await call(tx, "check_return_eligibility", { orderId: 1053, item: "Ridgeline Mid Hiking Boot (worn once)" }, as(TOM))).toMatchObject({ ok: false, error: { code: "ITEM_NOT_IN_ORDER" } });
    }));
});

describe("issue_goodwill_coupon", () => {
  it("issues up to 10% immediately for a store-caused problem, as a single-use code for that customer", () =>
    inTx(async (tx) => {
      // #1054 is Tom's lost order.
      const r = (await call(tx, "issue_goodwill_coupon", { customer: "tom.becker@example.com", orderId: "#1054", percent: 10, reason: "lost order" }, as(TOM))) as any;
      expect(r).toMatchObject({ ok: true, policyDecision: "auto_approved", data: { status: "issued", percentOff: 10 } });
      const [coupon] = await tx.select().from(s.coupons).where(eq(s.coupons.code, r.data.code));
      expect(coupon).toMatchObject({ customerId: TOM, singleUse: true, source: "goodwill", value: 10 });
    }));

  it("queues a coupon for a customer-side reason, or with no order, however small (goodwill rule, 2026-10-01)", () =>
    inTx(async (tx) => {
      // #1053: boots worn once, return denied. The model's `reason` can't change this.
      const worn = (await call(tx, "issue_goodwill_coupon", { customer: "tom.becker@example.com", orderId: 1053, percent: 5, reason: "store damaged the boots" }, as(TOM))) as any;
      expect(worn).toMatchObject({ ok: true, policyDecision: "queued_for_approval", data: { status: "pending_approval" } });
      const [approval] = await tx.select().from(s.approvals).where(eq(s.approvals.id, worn.data.approvalId));
      expect(approval).toMatchObject({ kind: "goodwill_coupon", customerId: TOM, orderNumber: 1053 });
      expect(approval!.reason).toMatch(/store-caused problem/);

      const none = await call(tx, "issue_goodwill_coupon", { customer: "maya.chen@example.com", percent: 5, reason: "sorry" }, as(MAYA));
      expect(none).toMatchObject({ policyDecision: "queued_for_approval" });
      expect(await tx.select().from(s.coupons).where(eq(s.coupons.source, "goodwill"))).toHaveLength(1); // only Sofia's seeded one
    }));

  it("damage counts once a damaged-item refund is on record", () =>
    inTx(async (tx) => {
      const coupon = (orderId: number) => call(tx, "issue_goodwill_coupon", { customer: "maya.chen@example.com", orderId, percent: 10, reason: "sorry" }, as(MAYA));
      // #1050 delivered with a cracked lamp, but nothing on record yet.
      expect(await coupon(1050)).toMatchObject({ policyDecision: "queued_for_approval" });
      await tx.delete(s.approvals); // otherwise the first request, still pending, queues the second
      await call(tx, "issue_refund", { orderId: 1050, amount: 29, reason: "damaged", item: "lamp-glowworm-300" }, as(MAYA));
      expect(await coupon(1050)).toMatchObject({ policyDecision: "auto_approved", data: { status: "issued" } });
    }));

  it("a damaged-item refund waiting for approval counts too", () =>
    inTx(async (tx) => {
      // Priya's $179.99 bag goes to approval: the damage is on record while it waits.
      await call(tx, "issue_refund", { orderId: 1051, amount: 179.99, reason: "damaged", item: "bag-harbor-double" }, as(PRIYA));
      const pending = await call(tx, "issue_goodwill_coupon", { customer: "priya.raman@example.com", orderId: 1051, percent: 10, reason: "sorry" }, as(PRIYA));
      expect(pending).toMatchObject({ policyDecision: "auto_approved" });
    }));

  it("a rejected damaged-item refund isn't a store-caused problem", () =>
    inTx(async (tx) => {
      await tx.insert(s.refunds).values({ orderNumber: 1042, amountCents: 1000, reason: "damaged", status: "rejected", createdAt: TEST_NOW });
      const r = await call(tx, "issue_goodwill_coupon", { customer: "maya.chen@example.com", orderId: 1042, percent: 10, reason: "sorry" }, as(MAYA));
      expect(r).toMatchObject({ policyDecision: "queued_for_approval" });
    }));

  it("someone else's order looks like a missing one, and nothing is queued", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_goodwill_coupon", { customer: "maya.chen@example.com", orderId: 1054, percent: 10, reason: "sorry" }, as(MAYA));
      expect(r).toMatchObject({ ok: false, error: { code: "ORDER_NOT_FOUND" } });
      expect(await tx.select().from(s.approvals)).toHaveLength(0);
    }));

  it("queues 15% for approval, even for a store-caused problem", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_goodwill_coupon", { customer: "tom.becker@example.com", orderId: 1054, percent: 15, reason: "lost order" }, as(TOM));
      expect(r).toMatchObject({ policyDecision: "queued_for_approval", data: { status: "pending_approval" } });
    }));

  it("queues a second coupon within 30 days (Sofia got one 10 days ago)", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_goodwill_coupon", { customer: "sofia.alvarez@example.com", orderId: 1055, percent: 5, reason: "delay" }, as(SOFIA));
      expect(r).toMatchObject({ policyDecision: "queued_for_approval" });
    }));

  it("only for the signed-in customer", () =>
    inTx(async (tx) => {
      const r = await call(tx, "issue_goodwill_coupon", { customer: "daniel.okafor@example.com", percent: 5, reason: "x y z" }, as(MAYA));
      expect(r).toMatchObject({ ok: false, error: { code: "NOT_SIGNED_IN_ACCOUNT" } });
    }));

  it("the issued code works in quote_price for its owner only", () =>
    inTx(async (tx) => {
      await call(tx, "issue_refund", { orderId: 1050, amount: 29, reason: "damaged", item: "lamp-glowworm-300" }, as(MAYA));
      const issued = (await call(tx, "issue_goodwill_coupon", { customer: "maya.chen@example.com", orderId: 1050, percent: 10, reason: "sorry" }, as(MAYA))) as any;
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
