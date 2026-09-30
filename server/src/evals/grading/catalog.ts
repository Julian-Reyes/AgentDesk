import { DEFAULT_STORE_DATE, fixedClock } from "../../domain/clock.ts";
import { applyAutomaticPromotions } from "../../policy/pricing.ts";
import { activePromotionsAt } from "../../policy/promotions.ts";
import { buildSeedData, type SeedData } from "../../seed/data.ts";
import type { GroundingCatalog } from "./grounding.ts";
import { createProductMatcher } from "./products.ts";

/** The catalog as the graders see it: names, list and current prices (at the store date), specs. */
export function createGradingCatalog(seed: SeedData = buildSeedData(), now: Date = fixedClock(DEFAULT_STORE_DATE)()): GroundingCatalog {
  const active = activePromotionsAt(seed.promotions, now);
  return {
    products: seed.products.map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      currentPriceCents: applyAutomaticPromotions([{ product: p, qty: 1 }], active)[0]!.lineTotalCents,
      specs: p.specs,
    })),
    matcher: createProductMatcher(seed.products),
  };
}
