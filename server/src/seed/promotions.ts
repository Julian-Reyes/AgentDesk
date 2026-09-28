import type { Category, PromotionParams } from "../db/schema.ts";
import { addDays } from "../domain/clock.ts";

export const SHIPPING = { thresholdCents: 7500, flatRateCents: 799 } as const;

export function buildPromotions(today: Date) {
  return [
    {
      id: "promo-tent-sale",
      name: "Tent Sale: 20% off all tents",
      type: "category_sale" as const,
      params: { type: "category_sale", category: "tents", percentOff: 20 } satisfies PromotionParams,
      startsAt: addDays(today, -10),
      endsAt: addDays(today, 20),
    },
    {
      id: "promo-headlamp-b2g1",
      name: "Headlamps: buy 2, get 1 free",
      type: "buy2get1" as const,
      params: { type: "buy2get1", category: "headlamps" } satisfies PromotionParams,
      startsAt: addDays(today, -30),
      endsAt: addDays(today, 30),
    },
    {
      id: "promo-free-shipping",
      name: "Free shipping on orders of $75 or more",
      type: "free_shipping" as const,
      params: { type: "free_shipping", ...SHIPPING } satisfies PromotionParams,
      startsAt: addDays(today, -365),
      endsAt: null,
    },
    {
      // An expired promotion, so "is the stove sale still on?" has a real answer.
      id: "promo-stove-sale-ended",
      name: "Stove Sale: 15% off stoves (ended)",
      type: "category_sale" as const,
      params: { type: "category_sale", category: "stoves", percentOff: 15 } satisfies PromotionParams,
      startsAt: addDays(today, -60),
      endsAt: addDays(today, -31),
    },
  ];
}

const endOfDay = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T23:59:59Z`);

export function buildPromoCoupons(today: Date) {
  const base = {
    minSpendCents: 0,
    excludedCategories: [] as Category[],
    singleUse: false,
    usedAt: null as Date | null,
    source: "promo" as const,
    customerId: null as number | null,
    createdAt: addDays(today, -90),
  };
  return [
    // Valid, simple: the spec's example code.
    { ...base, code: "SUMMER10", kind: "percent" as const, value: 10, expiresAt: endOfDay(addDays(today, 15)) },
    // Minimum spend.
    { ...base, code: "TRAIL25", kind: "amount" as const, value: 2500, minSpendCents: 15000, expiresAt: endOfDay(addDays(today, 107)) },
    // Excluded categories.
    { ...base, code: "GEAR20", kind: "percent" as const, value: 20, minSpendCents: 5000, excludedCategories: ["tents", "sleeping_bags"] as Category[], expiresAt: endOfDay(addDays(today, 45)) },
    // Expired.
    { ...base, code: "SPRING15", kind: "percent" as const, value: 15, expiresAt: endOfDay(addDays(today, -107)) },
    // Single-use, already redeemed.
    { ...base, code: "WELCOME5", kind: "amount" as const, value: 500, singleUse: true, usedAt: addDays(today, -20), expiresAt: null },
  ];
}
