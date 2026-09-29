import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { formatCents, type Cents } from "../domain/money.ts";
import type { CouponRecord } from "../policy/coupons.ts";
import { applyAutomaticPromotions, type ActivePromotions, type CartLine } from "../policy/pricing.ts";
import { activePromotionsAt } from "../policy/promotions.ts";
import { RULES } from "../policy/rules.ts";
import { fail, type ToolContext, type ToolResult } from "./define.ts";

// ---------- Argument schemas shared by several tools ----------

/** Dollars from the model ("29.99") → validated number with at most 2 decimals. */
export const dollarsArg = z
  .number()
  .positive()
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "At most 2 decimal places.");

export const toCents = (dollars: number): Cents => Math.round(dollars * 100);

/** Accepts 1042, "1042" or "#1042". */
export const orderNumberArg = z
  .union([z.number().int(), z.string().regex(/^#?\s*\d+$/, "An order number like 1042 or #1042.")])
  .transform((v) => (typeof v === "number" ? v : Number(v.replace(/[#\s]/g, ""))));

export const cartArg = z
  .array(
    z.object({
      productId: z.string().min(1),
      qty: z.number().int().min(1).max(RULES.maxQtyPerLine),
    }),
  )
  .min(1)
  .max(20);

// ---------- Data access ----------

export async function loadActivePromotions(db: DbOrTx, now: Date) {
  const rows = await db
    .select()
    .from(s.promotions)
    .where(and(lte(s.promotions.startsAt, now), or(isNull(s.promotions.endsAt), gte(s.promotions.endsAt, now))));
  return { rows, active: activePromotionsAt(rows, now) };
}

export async function loadCoupon(db: DbOrTx, code: string): Promise<CouponRecord | null> {
  const [row] = await db.select().from(s.coupons).where(eq(s.coupons.code, code.trim().toUpperCase()));
  return row ?? null;
}

/** Resolves cart product ids to products, merging duplicate lines. */
export async function loadCart(
  db: DbOrTx,
  cart: { productId: string; qty: number }[],
): Promise<ToolResult<CartLine[]>> {
  const merged = new Map<string, number>();
  for (const line of cart) merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.qty);

  const all = await db.select().from(s.products);
  const byId = new Map(all.map((p) => [p.id, p]));
  const lines: CartLine[] = [];
  for (const [productId, qty] of merged) {
    const product = byId.get(productId);
    if (!product) {
      return fail("PRODUCT_NOT_FOUND", `No product with id "${productId}". Use search_products to find the right id.`);
    }
    if (qty > RULES.maxQtyPerLine) {
      return fail("QTY_LIMIT", `At most ${RULES.maxQtyPerLine} of one product per order.`);
    }
    lines.push({ product, qty });
  }
  return { ok: true, data: lines };
}

/**
 * Order ownership, enforced in one place. An order that belongs to someone
 * else gets exactly the same answer as one that doesn't exist, so order
 * numbers can't be probed.
 */
export async function loadOwnedOrder(ctx: ToolContext, orderNumber: number) {
  if (ctx.session.customerId === null) {
    return fail("AUTH_REQUIRED", "The customer needs to sign in before we can look up orders.");
  }
  const [order] = await ctx.db.select().from(s.orders).where(eq(s.orders.number, orderNumber));
  if (!order || order.customerId !== ctx.session.customerId) {
    return fail("ORDER_NOT_FOUND", `No order #${orderNumber} was found on this customer's account.`);
  }
  return { ok: true as const, data: order };
}

// ---------- Presenting data to the model ----------

export const stockStatus = (stock: number) => (stock === 0 ? "out_of_stock" : stock <= 5 ? "low_stock" : "in_stock");

/**
 * What one unit costs today: the product run through the same pricing engine
 * as quote_price with today's automatic promotions. Buy-2-get-1 never lowers a
 * single unit's price, so only category sales show up here.
 */
export function currentPriceCents(product: typeof s.products.$inferSelect, active: ActivePromotions): Cents {
  return applyAutomaticPromotions([{ product, qty: 1 }], active)[0]!.lineTotalCents;
}

/** Every tool that shows a product uses this, so prices always appear as listPrice + currentPrice. */
export function presentProduct(p: typeof s.products.$inferSelect, totalStock: number, active: ActivePromotions) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    listPrice: formatCents(p.priceCents),
    currentPrice: formatCents(currentPriceCents(p, active)),
    rating: p.rating,
    description: p.description,
    specs: p.specs,
    availability: stockStatus(totalStock),
  };
}

export const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Finds one item in an order from what the model passed: a product id, a
 * variant id, or (part of) the product name. Shared by check_return_eligibility
 * and issue_refund so both tools identify items the same way.
 */
export async function findOrderItem(db: DbOrTx, orderNumber: number, query: string) {
  const items = await db
    .select({ item: s.orderItems, name: s.products.name })
    .from(s.orderItems)
    .innerJoin(s.products, eq(s.products.id, s.orderItems.productId))
    .where(eq(s.orderItems.orderNumber, orderNumber));

  const q = query.trim().toLowerCase();
  const exact = items.filter((i) => i.item.productId === q || i.item.variantId === q || i.name.toLowerCase() === q);
  const matches = exact.length ? exact : items.filter((i) => i.name.toLowerCase().includes(q) || q.includes(i.name.toLowerCase()));
  if (matches.length !== 1) {
    return fail(
      matches.length ? "ITEM_AMBIGUOUS" : "ITEM_NOT_IN_ORDER",
      matches.length ? "More than one item matches; ask which one." : `No item matching "${query}" in order #${orderNumber}.`,
      { itemsInOrder: items.map((i) => ({ productId: i.item.productId, name: i.name })) },
    );
  }
  return { ok: true as const, data: matches[0]! };
}

/** What the customer paid for a whole order line, after sales. */
export const linePaidCents = (item: typeof s.orderItems.$inferSelect): Cents => item.unitPriceCents * item.qty - item.discountCents;
