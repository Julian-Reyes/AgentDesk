import type { Product } from "../lib/api.ts";

/** "sleeping_bags" → "Sleeping bags". */
export const categoryLabel = (c: string) => {
  const words = c.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const AVAILABILITY: Record<Product["availability"], { label: string; tone: "ok" | "low" | "out" }> = {
  in_stock: { label: "In stock", tone: "ok" },
  low_stock: { label: "Only a few left", tone: "low" },
  out_of_stock: { label: "Out of stock", tone: "out" },
};

/** Percent off, from the API's formatted prices ("$249.00" → "$199.20" is 20). Display only; prices come from the server. */
export function percentOff(listPrice: string, currentPrice: string): number | null {
  const cents = (p: string) => Math.round(Number(p.replace(/[$,]/g, "")) * 100);
  const list = cents(listPrice);
  const now = cents(currentPrice);
  if (!(list > 0) || !(now < list)) return null;
  return Math.round(((list - now) * 100) / list);
}
