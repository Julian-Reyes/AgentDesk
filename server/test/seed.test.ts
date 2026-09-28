import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Tx } from "../src/db/client.ts";
import * as s from "../src/db/schema.ts";
import { quote } from "../src/policy/pricing.ts";
import { activePromotionsAt } from "../src/policy/promotions.ts";
import { buildSeedData } from "../src/seed/data.ts";
import { seed } from "../src/seed/index.ts";
import { inTx } from "./helpers.ts";

const TABLES = ["products", "product_variants", "promotions", "coupons", "policies", "customers", "orders", "order_items", "tracking_events", "refunds"];

async function hashDatabase(tx: Tx) {
  const hash = createHash("sha256");
  for (const table of TABLES) {
    const { rows } = await tx.execute(sql.raw(`select * from ${table} order by 1`));
    hash.update(table + JSON.stringify(rows));
  }
  return hash.digest("hex");
}

describe("seed", () => {
  it("builds identical data every time", () => {
    expect(JSON.stringify(buildSeedData("2026-09-15"))).toBe(JSON.stringify(buildSeedData("2026-09-15")));
  });

  it("reseeding produces byte-identical tables", () =>
    inTx(async (tx) => {
      await seed(tx, "2026-09-15");
      const first = await hashDatabase(tx);
      await seed(tx, "2026-09-15");
      expect(await hashDatabase(tx)).toBe(first);
    }));

  it("has the expected sizes and covers every order status", () => {
    const d = buildSeedData("2026-09-15");
    expect(d.products).toHaveLength(60);
    expect(d.customers).toHaveLength(200);
    expect(d.orders).toHaveLength(400);
    expect(new Set(d.orders.map((o) => o.status))).toEqual(
      new Set(["processing", "shipped", "delivered", "delayed", "returned", "lost"]),
    );
  });

  it("only uses reserved example.com emails", () => {
    const d = buildSeedData("2026-09-15");
    expect(d.customers.every((c) => c.email.endsWith("@example.com"))).toBe(true);
  });

  it("nothing is dated after the store's 'now'", () => {
    const d = buildSeedData("2026-09-15");
    const now = new Date("2026-09-15T12:00:00Z");
    const dates = [
      ...d.orders.flatMap((o) => [o.placedAt, o.deliveredAt]),
      ...d.trackingEvents.map((e) => e.at),
      ...d.refunds.map((r) => r.createdAt),
    ].filter((x): x is Date => x !== null);
    expect(dates.filter((x) => x > now)).toEqual([]);
  });

  it("every stored order total equals quote() with the promotions active when it was placed", () =>
    inTx(async (tx) => {
      // Rebuilt from the database rows, not from the seed builder's in-memory data.
      const products = new Map((await tx.select().from(s.products)).map((p) => [p.id, p]));
      const promotions = await tx.select().from(s.promotions);
      const items = await tx.select().from(s.orderItems);
      const orders = await tx.select().from(s.orders);
      expect(orders).toHaveLength(400);
      for (const o of orders) {
        const q = quote({
          lines: items.filter((i) => i.orderNumber === o.number).map((i) => ({ product: products.get(i.productId)!, qty: i.qty })),
          promos: activePromotionsAt(promotions, o.placedAt),
          now: o.placedAt,
          customerId: o.customerId,
        });
        expect(
          { subtotal: o.subtotalCents, discount: o.discountCents, shipping: o.shippingCents, total: o.totalPaidCents },
          `order #${o.number}`,
        ).toEqual({ subtotal: q.subtotalCents, discount: q.promoDiscountCents, shipping: q.shippingCents, total: q.totalCents });
      }
    }));

  it("each order's line discounts add up to the order's discount", () => {
    const d = buildSeedData("2026-09-15");
    let discountedLines = 0;
    for (const o of d.orders) {
      const lines = d.orderItems.filter((i) => i.orderNumber === o.number);
      expect(lines.reduce((sum, i) => sum + i.discountCents, 0), `#${o.number}`).toBe(o.discountCents);
      discountedLines += lines.filter((i) => i.discountCents > 0).length;
    }
    expect(discountedLines).toBeGreaterThan(0);
  });

  it("#1042 (a tent bought during the tent sale) got 20% off", () => {
    const o = buildSeedData("2026-09-15").orders.find((x) => x.number === 1042)!;
    // Canopy 2 Trail Tent $189.00 − 20% ($37.80) = $151.20; over $75, so free shipping.
    expect(o).toMatchObject({ subtotalCents: 18900, discountCents: 3780, shippingCents: 0, totalPaidCents: 15120 });
  });

  it("tent and stove orders are discounted exactly when placed inside their sale window", () => {
    const d = buildSeedData("2026-09-15");
    const windows = { tents: "promo-tent-sale", stoves: "promo-stove-sale-ended" } as const;
    let checked = 0;
    for (const [category, promoId] of Object.entries(windows)) {
      const promo = d.promotions.find((p) => p.id === promoId)!;
      for (const o of d.orders) {
        const hasItem = d.orderItems.some(
          (i) => i.orderNumber === o.number && d.products.find((p) => p.id === i.productId)!.category === category,
        );
        if (!hasItem) continue;
        const inWindow = o.placedAt >= promo.startsAt && o.placedAt <= promo.endsAt!;
        if (inWindow) {
          expect(o.discountCents, `#${o.number} placed in ${promoId}`).toBeGreaterThan(0);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10); // the windows really do contain orders
  });

  it("orders placed outside every sale/deal window have no discount", () => {
    const d = buildSeedData("2026-09-15");
    const deals = d.promotions.filter((p) => p.type !== "free_shipping");
    const outside = d.orders.filter((o) => deals.every((p) => o.placedAt < p.startsAt || (p.endsAt && o.placedAt > p.endsAt)));
    expect(outside.length).toBeGreaterThan(100);
    expect(outside.filter((o) => o.discountCents !== 0)).toEqual([]);
  });

  it("a returned order is refunded what was paid for the goods (after discounts), not shipping", () => {
    const d = buildSeedData("2026-09-15");
    for (const r of d.refunds) {
      const o = d.orders.find((x) => x.number === r.orderNumber)!;
      expect(r.amountCents).toBe(o.subtotalCents - o.discountCents);
    }
  });

  it("order totals add up and refunds never exceed what was paid", () => {
    const d = buildSeedData("2026-09-15");
    for (const o of d.orders) {
      const items = d.orderItems.filter((i) => i.orderNumber === o.number);
      expect(o.subtotalCents).toBe(items.reduce((s, i) => s + i.qty * i.unitPriceCents, 0));
      expect(o.totalPaidCents).toBe(o.subtotalCents - o.discountCents + o.shippingCents);
      const refunded = d.refunds.filter((r) => r.orderNumber === o.number).reduce((s, r) => s + r.amountCents, 0);
      expect(refunded).toBeLessThanOrEqual(o.totalPaidCents);
    }
  });
});
