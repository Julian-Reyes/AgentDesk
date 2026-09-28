import { sql } from "drizzle-orm";
import { connect, type DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { buildSeedData } from "./data.ts";

const TABLES = [
  "escalations",
  "refunds",
  "approvals",
  "tracking_events",
  "order_items",
  "orders",
  "coupons",
  "customers",
  "policies",
  "promotions",
  "product_variants",
  "products",
];

/**
 * Wipes and reloads the whole store in one transaction, so a failed seed
 * leaves the old data intact. RESTART IDENTITY resets serial ids, which keeps
 * reruns identical.
 */
export async function seed(db: DbOrTx, storeDate = process.env.STORE_DATE) {
  const data = buildSeedData(storeDate);
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
    await tx.insert(s.products).values(data.products);
    await tx.insert(s.productVariants).values(data.variants);
    await tx.insert(s.promotions).values(data.promotions);
    await tx.insert(s.policies).values(data.policies);
    await tx.insert(s.customers).values(data.customers);
    await tx.insert(s.coupons).values(data.coupons);
    await tx.insert(s.orders).values(data.orders);
    await tx.insert(s.orderItems).values(data.orderItems);
    // Postgres limits parameters per statement, so insert tracking in chunks.
    for (let i = 0; i < data.trackingEvents.length; i += 1000) {
      await tx.insert(s.trackingEvents).values(data.trackingEvents.slice(i, i + 1000));
    }
    await tx.insert(s.refunds).values(data.refunds);
  });
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db, close } = connect();
  try {
    const data = await seed(db);
    console.log(
      `Seeded Larchgrove Supply Co.: ${data.products.length} products, ${data.variants.length} variants, ` +
        `${data.customers.length} customers, ${data.orders.length} orders, ${data.trackingEvents.length} tracking events.`,
    );
  } finally {
    await close();
  }
}
