import type { PromotionParams } from "../db/schema.ts";
import type { ActivePromotions } from "./pricing.ts";

export type PromotionRow = {
  name: string;
  params: PromotionParams;
  startsAt: Date;
  endsAt: Date | null;
};

export const isActiveAt = (p: PromotionRow, at: Date) =>
  p.startsAt.getTime() <= at.getTime() && (p.endsAt === null || p.endsAt.getTime() >= at.getTime());

/**
 * The promotions in effect at a moment, in the shape the pricing engine takes.
 * Used both by the tools (at "now") and by the seed (at each order's placedAt),
 * so historical orders are priced by exactly the same rules as live quotes.
 */
export function activePromotionsAt(rows: PromotionRow[], at: Date): ActivePromotions {
  const active: ActivePromotions = {
    categorySales: [],
    buy2get1: [],
    // No free-shipping promotion in effect: shipping is never free, and costs nothing extra.
    shipping: { thresholdCents: Number.MAX_SAFE_INTEGER, flatRateCents: 0 },
  };
  for (const row of rows) {
    if (!isActiveAt(row, at)) continue;
    const p = row.params;
    if (p.type === "category_sale") active.categorySales.push({ name: row.name, category: p.category, percentOff: p.percentOff });
    if (p.type === "buy2get1") active.buy2get1.push({ name: row.name, category: p.category });
    if (p.type === "free_shipping") active.shipping = { thresholdCents: p.thresholdCents, flatRateCents: p.flatRateCents };
  }
  return active;
}
