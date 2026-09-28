import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema.ts";
import { formatCents } from "../domain/money.ts";
import { checkCoupon, describeCoupon, normalizeCouponCode } from "../policy/coupons.ts";
import { applyAutomaticPromotions, quote } from "../policy/pricing.ts";
import { defineTool, fail, ok } from "./define.ts";
import {
  cartArg,
  day,
  dollarsArg,
  loadActivePromotions,
  loadCart,
  loadCoupon,
  presentProduct,
  stockStatus,
  toCents,
} from "./common.ts";

const STOPWORDS = new Set(["a", "an", "the", "for", "and", "or", "with", "of", "to", "in", "on", "me", "my", "i", "is", "any", "some", "best", "good"]);

export const searchProducts = defineTool({
  name: "search_products",
  description:
    "Search the catalog by keywords and/or filters. Each product has listPrice (regular price) and currentPrice (what one unit costs today, after any active sale). minPrice/maxPrice filter on currentPrice, in dollars. When they differ, you can say e.g. 'was $249.00, now $199.20'. For a cart total (multi-buy deals, coupons, shipping), use quote_price.",
  agents: ["shopping"],
  args: z.object({
    query: z.string().max(200).default(""),
    filters: z
      .object({
        category: z.enum(s.CATEGORIES).optional(),
        minPrice: dollarsArg.optional(),
        maxPrice: dollarsArg.optional(),
        minCapacityPersons: z.number().int().positive().optional(),
        maxWeightGrams: z.number().int().positive().optional(),
        /** Sleeping bags/boots/parkas rated at least this cold, e.g. -5. */
        maxTempRatingC: z.number().int().optional(),
        waterproof: z.boolean().optional(),
        minRating: z.number().min(0).max(5).optional(),
        inStockOnly: z.boolean().optional(),
      })
      .default({}),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async run(ctx, { query, filters, limit }) {
    // 60 products: filtering in memory is simpler and plenty fast. A real
    // catalog would push this into SQL / full-text search.
    const rows = await ctx.db
      .select({ product: s.products, stock: sql<number>`coalesce(sum(${s.productVariants.stock}), 0)::int` })
      .from(s.products)
      .leftJoin(s.productVariants, eq(s.productVariants.productId, s.products.id))
      .groupBy(s.products.id);

    // "Under $200" means what the customer pays today, so price filters use the
    // current price: one unit run through the same pricing engine as quote_price.
    // (Buy-2-get-1 doesn't lower a single unit's price, so it isn't reflected here.)
    const { active } = await loadActivePromotions(ctx.db, ctx.now);
    const currentPriceCents = (product: typeof s.products.$inferSelect) =>
      applyAutomaticPromotions([{ product, qty: 1 }], active)[0]!.lineTotalCents;

    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
      .map((t) => t.replace(/s$/, "")); // "tents" matches "tent"

    const f = filters;
    const matches = rows
      .filter(({ product: p, stock }) => {
        const sp = p.specs;
        const price = currentPriceCents(p);
        if (f.category && p.category !== f.category) return false;
        if (f.minPrice !== undefined && price < toCents(f.minPrice)) return false;
        if (f.maxPrice !== undefined && price > toCents(f.maxPrice)) return false;
        if (f.minCapacityPersons !== undefined && (sp.capacityPersons ?? 0) < f.minCapacityPersons) return false;
        if (f.maxWeightGrams !== undefined && (sp.weightGrams ?? Infinity) > f.maxWeightGrams) return false;
        if (f.maxTempRatingC !== undefined && (sp.tempRatingC ?? Infinity) > f.maxTempRatingC) return false;
        if (f.waterproof !== undefined && (sp.waterproof ?? false) !== f.waterproof) return false;
        if (f.minRating !== undefined && p.rating < f.minRating) return false;
        if (f.inStockOnly && stock === 0) return false;
        return true;
      })
      .map((row) => {
        const p = row.product;
        const haystack = `${p.name} ${p.category.replace("_", " ")} ${p.description} ${p.specs.material ?? ""} ${p.specs.fuel ?? ""}`.toLowerCase();
        const score = tokens.filter((t) => haystack.includes(t)).length;
        return { ...row, score };
      })
      .filter((r) => tokens.length === 0 || r.score > 0)
      .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating || a.product.id.localeCompare(b.product.id));

    return ok({
      totalMatches: matches.length,
      products: matches.slice(0, limit).map(({ product, stock }) => {
        const { price: _list, ...rest } = presentProduct(product, stock);
        return {
          ...rest,
          listPrice: formatCents(product.priceCents),
          currentPrice: formatCents(currentPriceCents(product)),
          activeDeals: dealsFor(product.category, active),
        };
      }),
      note: "currentPrice is today's price for one unit. Use quote_price for a cart total with multi-buy deals, coupons and shipping.",
    });
  },
});

function dealsFor(category: s.Category, active: Awaited<ReturnType<typeof loadActivePromotions>>["active"]) {
  return [
    ...active.categorySales.filter((d) => d.category === category).map((d) => d.name),
    ...active.buy2get1.filter((d) => d.category === category).map((d) => d.name),
  ];
}

export const getProduct = defineTool({
  name: "get_product",
  description: "Full details for one product by id: specs, list price, rating, and which sizes/colors exist.",
  agents: ["shopping"],
  args: z.object({ id: z.string().min(1) }),
  async run(ctx, { id }) {
    const [product] = await ctx.db.select().from(s.products).where(eq(s.products.id, id));
    if (!product) return fail("PRODUCT_NOT_FOUND", `No product with id "${id}". Use search_products to find it.`);
    const variants = await ctx.db.select().from(s.productVariants).where(eq(s.productVariants.productId, id)).orderBy(s.productVariants.id);
    const total = variants.reduce((n, v) => n + v.stock, 0);
    const { active } = await loadActivePromotions(ctx.db, ctx.now);
    return ok({
      ...presentProduct(product, total),
      activeDeals: dealsFor(product.category, active),
      variants: variants.map((v) => ({ size: v.size, color: v.color, availability: stockStatus(v.stock) })),
    });
  },
});

export const checkStock = defineTool({
  name: "check_stock",
  description:
    "Stock for a product, optionally for a specific size and/or color. Without size/color, returns every variant.",
  agents: ["shopping"],
  args: z.object({
    productId: z.string().min(1),
    size: z.string().optional(),
    color: z.string().optional(),
  }),
  async run(ctx, { productId, size, color }) {
    const [product] = await ctx.db.select().from(s.products).where(eq(s.products.id, productId));
    if (!product) return fail("PRODUCT_NOT_FOUND", `No product with id "${productId}".`);
    const variants = await ctx.db.select().from(s.productVariants).where(eq(s.productVariants.productId, productId)).orderBy(s.productVariants.id);

    const norm = (x: string | null | undefined) => x?.trim().toLowerCase();
    const matching = variants.filter(
      (v) => (size === undefined || norm(v.size) === norm(size)) && (color === undefined || norm(v.color) === norm(color)),
    );
    if (matching.length === 0) {
      return fail("VARIANT_NOT_FOUND", `${product.name} doesn't come in that size/color.`, {
        sizes: [...new Set(variants.map((v) => v.size).filter(Boolean))],
        colors: [...new Set(variants.map((v) => v.color).filter(Boolean))],
      });
    }
    return ok({
      product: product.name,
      variants: matching.map((v) => ({
        size: v.size,
        color: v.color,
        inStock: v.stock > 0,
        unitsAvailable: v.stock,
        availability: stockStatus(v.stock),
      })),
    });
  },
});

export const getActivePromotions = defineTool({
  name: "get_active_promotions",
  description: "Current sales, deals, free-shipping threshold, and publicly advertised coupon codes.",
  agents: ["shopping"],
  args: z.object({}),
  async run(ctx) {
    const { rows, active } = await loadActivePromotions(ctx.db, ctx.now);
    const codes = await ctx.db.select().from(s.coupons).where(eq(s.coupons.source, "promo"));
    const publicCodes = codes.filter(
      (c) => !c.singleUse && (!c.expiresAt || c.expiresAt >= ctx.now),
    );
    return ok({
      promotions: rows
        .filter((r) => r.type !== "free_shipping")
        .map((r) => ({ name: r.name, endsOn: day(r.endsAt) })),
      freeShipping: `Free shipping on orders of ${formatCents(active.shipping.thresholdCents)} or more; otherwise ${formatCents(active.shipping.flatRateCents)}.`,
      couponCodes: publicCodes.map((c) => ({ code: c.code, terms: describeCoupon(c) })),
      rules: "One coupon per order. Sales apply first, then buy-2-get-1, then the coupon.",
    });
  },
});

export const validateCoupon = defineTool({
  name: "validate_coupon",
  description:
    "Check whether a coupon code is valid for a cart. Explains exactly why if not (expired, minimum spend, excluded category, already used, unknown).",
  agents: ["shopping"],
  args: z.object({ code: z.string().min(1).max(40), cart: cartArg }),
  async run(ctx, { code, cart }) {
    const lines = await loadCart(ctx.db, cart);
    if (!lines.ok) return lines;
    const { active } = await loadActivePromotions(ctx.db, ctx.now);
    const priced = applyAutomaticPromotions(lines.data, active);
    const result = checkCoupon(await loadCoupon(ctx.db, code), code, {
      lines: priced,
      now: ctx.now,
      customerId: ctx.session.customerId,
    });
    if (!result.valid) {
      return ok(
        { valid: false, code: normalizeCouponCode(code), reason: result.code, message: result.message, ...(result.details ?? {}) },
        "denied",
      );
    }
    return ok(
      {
        valid: true,
        code: result.code,
        terms: result.description,
        discount: formatCents(result.discountCents),
        notAppliedTo: result.excludedProductIds,
      },
      "auto_approved",
    );
  },
});

export const quotePrice = defineTool({
  name: "quote_price",
  description:
    "The ONLY way to get a price for a cart. Applies sales, buy-2-get-1, at most one coupon, and shipping, and returns an itemized quote. Quote these amounts exactly; never calculate prices yourself.",
  agents: ["shopping"],
  args: z.object({ cart: cartArg, coupon: z.string().min(1).max(40).optional() }),
  async run(ctx, { cart, coupon }) {
    const lines = await loadCart(ctx.db, cart);
    if (!lines.ok) return lines;
    const { active } = await loadActivePromotions(ctx.db, ctx.now);
    const q = quote({
      lines: lines.data,
      promos: active,
      ...(coupon ? { coupon: { code: coupon, record: await loadCoupon(ctx.db, coupon) } } : {}),
      now: ctx.now,
      customerId: ctx.session.customerId,
    });

    const data = {
      lines: q.lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        qty: l.qty,
        unitPrice: formatCents(l.unitPriceCents),
        discounts: l.discounts.map((d) => ({ deal: d.label, amount: `-${formatCents(d.amountCents)}` })),
        lineTotal: formatCents(l.lineTotalCents),
      })),
      subtotal: q.display.subtotal,
      coupon: q.coupon
        ? q.coupon.applied
          ? { code: q.coupon.code, applied: true, discount: `-${formatCents(q.coupon.discountCents)}` }
          : { code: q.coupon.code, applied: false, reason: q.coupon.rejection.code, message: q.coupon.rejection.message }
        : null,
      totalDiscounts: q.display.discounts,
      shipping: q.display.shipping,
      total: q.display.total,
      // Kept in cents for the eval graders and traces; the model should quote `total`.
      totalCents: q.totalCents,
    };
    const decision = q.coupon ? (q.coupon.applied ? "auto_approved" : "denied") : undefined;
    return ok(data, decision);
  },
});

export const SHOPPING_TOOLS = [searchProducts, getProduct, checkStock, getActivePromotions, validateCoupon, quotePrice];
