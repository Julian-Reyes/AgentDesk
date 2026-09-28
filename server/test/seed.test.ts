import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Tx } from "../src/db/client.ts";
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
