import type { Category } from "../db/schema.ts";
import { formatCents, percentOf, type Cents } from "../domain/money.ts";
import { checkCoupon, type CouponRecord, type CouponRejection } from "./coupons.ts";

/**
 * The only place prices are computed. The order of operations is fixed and is
 * also spelled out in the "promotions" policy document:
 *   1. line subtotal = unit price × qty
 *   2. category sale, per line
 *   3. buy-2-get-1: within the promo category, every 3rd unit (cheapest first
 *      after sorting by price, high to low) is free
 *   4. at most one coupon, on the non-excluded items after steps 2–3
 *   5. shipping: free at or above the threshold (after all discounts), else flat rate
 * Tax is not modeled (prices include tax).
 */

export type PricingProduct = {
  id: string;
  name: string;
  category: Category;
  priceCents: Cents;
};

export type CartLine = { product: PricingProduct; qty: number };

export type ActivePromotions = {
  categorySales: { name: string; category: Category; percentOff: number }[];
  buy2get1: { name: string; category: Category }[];
  shipping: { thresholdCents: Cents; flatRateCents: Cents };
};

export type LineDiscount = { label: string; amountCents: Cents };

export type PricedLine = {
  productId: string;
  name: string;
  category: Category;
  qty: number;
  unitPriceCents: Cents;
  lineSubtotalCents: Cents;
  discounts: LineDiscount[];
  /** After automatic promotions (sale, buy-2-get-1), before any coupon. */
  lineTotalCents: Cents;
};

export type Quote = {
  lines: PricedLine[];
  subtotalCents: Cents;
  promoDiscountCents: Cents;
  coupon:
    | null
    | { code: string; applied: true; discountCents: Cents; eligibleSubtotalCents: Cents }
    | { code: string; applied: false; rejection: CouponRejection };
  merchandiseTotalCents: Cents;
  shippingCents: Cents;
  freeShippingThresholdCents: Cents;
  totalCents: Cents;
  /** Pre-formatted amounts, so the agent quotes them verbatim instead of converting. */
  display: {
    subtotal: string;
    discounts: string;
    shipping: string;
    total: string;
  };
};

/** Steps 1–3: automatic promotions, per line. */
export function applyAutomaticPromotions(
  lines: CartLine[],
  promos: ActivePromotions,
): PricedLine[] {
  const priced: PricedLine[] = lines.map(({ product, qty }) => {
    const lineSubtotalCents = product.priceCents * qty;
    const discounts: LineDiscount[] = [];
    for (const sale of promos.categorySales) {
      if (sale.category === product.category) {
        discounts.push({ label: sale.name, amountCents: percentOf(lineSubtotalCents, sale.percentOff) });
      }
    }
    return {
      productId: product.id,
      name: product.name,
      category: product.category,
      qty,
      unitPriceCents: product.priceCents,
      lineSubtotalCents,
      discounts,
      lineTotalCents: 0, // filled in below
    };
  });

  for (const deal of promos.buy2get1) {
    // Expand qualifying lines into single units, most expensive first. In
    // every group of three, the third (cheapest) unit is free.
    const units = priced
      .map((line, lineIndex) => ({ line, lineIndex }))
      .filter(({ line }) => line.category === deal.category)
      .flatMap(({ line, lineIndex }) =>
        Array.from({ length: line.qty }, () => ({ lineIndex, price: line.unitPriceCents })),
      )
      .sort((a, b) => b.price - a.price || a.lineIndex - b.lineIndex);

    const freeByLine = new Map<number, Cents>();
    for (let i = 2; i < units.length; i += 3) {
      const unit = units[i]!;
      freeByLine.set(unit.lineIndex, (freeByLine.get(unit.lineIndex) ?? 0) + unit.price);
    }
    for (const [lineIndex, amountCents] of freeByLine) {
      priced[lineIndex]!.discounts.push({ label: deal.name, amountCents });
    }
  }

  for (const line of priced) {
    const off = line.discounts.reduce((sum, d) => sum + d.amountCents, 0);
    line.lineTotalCents = Math.max(0, line.lineSubtotalCents - off);
  }
  return priced;
}

export type QuoteInput = {
  lines: CartLine[];
  promos: ActivePromotions;
  /** The code the customer asked for, and what we found for it (null = unknown code). */
  coupon?: { code: string; record: CouponRecord | null };
  now: Date;
  customerId: number | null;
};

export function quote(input: QuoteInput): Quote {
  const lines = applyAutomaticPromotions(input.lines, input.promos);
  const subtotalCents = sum(lines.map((l) => l.lineSubtotalCents));
  const afterPromos = sum(lines.map((l) => l.lineTotalCents));
  const promoDiscountCents = subtotalCents - afterPromos;

  let coupon: Quote["coupon"] = null;
  let couponDiscountCents = 0;
  if (input.coupon) {
    const check = checkCoupon(input.coupon.record, input.coupon.code, {
      lines,
      now: input.now,
      customerId: input.customerId,
    });
    if (check.valid) {
      couponDiscountCents = check.discountCents;
      coupon = {
        code: check.code,
        applied: true,
        discountCents: check.discountCents,
        eligibleSubtotalCents: check.eligibleSubtotalCents,
      };
    } else {
      // An invalid coupon is never honored: the quote is simply without it.
      coupon = { code: input.coupon.code, applied: false, rejection: check };
    }
  }

  const merchandiseTotalCents = afterPromos - couponDiscountCents;
  const { thresholdCents, flatRateCents } = input.promos.shipping;
  const shippingCents = merchandiseTotalCents >= thresholdCents ? 0 : flatRateCents;
  const totalCents = merchandiseTotalCents + shippingCents;
  const allDiscounts = promoDiscountCents + couponDiscountCents;

  return {
    lines,
    subtotalCents,
    promoDiscountCents,
    coupon,
    merchandiseTotalCents,
    shippingCents,
    freeShippingThresholdCents: thresholdCents,
    totalCents,
    display: {
      subtotal: formatCents(subtotalCents),
      discounts: allDiscounts ? `-${formatCents(allDiscounts)}` : formatCents(0),
      shipping: shippingCents ? formatCents(shippingCents) : "FREE",
      total: formatCents(totalCents),
    },
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
