import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { loadActivePromotions, presentProduct } from "../tools/common.ts";
import { fail, ok } from "../tools/define.ts";
import type { AppDeps } from "./app.ts";

/**
 * The storefront's product grid. It goes through presentProduct, the same
 * function the agents' tools use, so the price on a product card is always
 * the price the Shopping Assistant quotes for it ("was $249.00, now $199.20").
 */
export async function listProducts(db: DbOrTx, now: Date, category?: s.Category) {
  const rows = await db
    .select({ product: s.products, stock: sql<number>`coalesce(sum(${s.productVariants.stock}), 0)::int` })
    .from(s.products)
    .leftJoin(s.productVariants, eq(s.productVariants.productId, s.products.id))
    .where(category ? eq(s.products.category, category) : undefined)
    .groupBy(s.products.id);
  const { active } = await loadActivePromotions(db, now);
  const order = (c: s.Category) => s.CATEGORIES.indexOf(c);
  return rows
    .sort((a, b) => order(a.product.category) - order(b.product.category) || a.product.name.localeCompare(b.product.name))
    .map(({ product, stock }) => {
      const p = presentProduct(product, stock, active);
      return { ...p, onSale: p.currentPrice !== p.listPrice };
    });
}

const Query = z.object({ category: z.enum(s.CATEGORIES).optional() });

export function productRoutes(deps: AppDeps) {
  return new Hono().get("/", async (c) => {
    const q = Query.safeParse(c.req.query());
    if (!q.success) return c.json(fail("INVALID_QUERY", `category must be one of: ${s.CATEGORIES.join(", ")}.`), 400);
    return c.json(ok({ categories: s.CATEGORIES, products: await listProducts(deps.db, deps.clock(), q.data.category) }));
  });
}
