import type { Category } from "../db/schema.ts";
import { formatCents, percentOf, type Cents } from "../domain/money.ts";
import type { PricedLine } from "./pricing.ts";

export type CouponRecord = {
  code: string;
  kind: "percent" | "amount";
  value: number;
  minSpendCents: Cents;
  excludedCategories: Category[];
  expiresAt: Date | null;
  singleUse: boolean;
  usedAt: Date | null;
  customerId: number | null;
};

export type CouponRejectionCode =
  | "NOT_FOUND"
  | "EXPIRED"
  | "ALREADY_USED"
  | "CATEGORY_EXCLUDED"
  | "MIN_SPEND_NOT_MET";

export type CouponRejection = {
  valid: false;
  code: CouponRejectionCode;
  message: string;
  details?: Record<string, unknown>;
};

export type CouponAcceptance = {
  valid: true;
  code: string;
  discountCents: Cents;
  eligibleSubtotalCents: Cents;
  /** Items in the cart the coupon doesn't apply to (excluded categories). */
  excludedProductIds: string[];
  description: string;
};

export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

/**
 * Decides whether a coupon applies to a cart that has already had automatic
 * promotions applied. One coupon per order is enforced by the tool schemas,
 * which accept a single code, not a list.
 */
export function checkCoupon(
  record: CouponRecord | null,
  requestedCode: string,
  ctx: { lines: PricedLine[]; now: Date; customerId: number | null },
): CouponAcceptance | CouponRejection {
  const code = normalizeCouponCode(requestedCode);

  // A goodwill code belonging to someone else looks exactly like an unknown
  // code, so it can't be used to probe other customers' coupons.
  if (!record || (record.customerId !== null && record.customerId !== ctx.customerId)) {
    return reject("NOT_FOUND", `Coupon code ${code} doesn't exist.`);
  }
  if (record.expiresAt && ctx.now.getTime() > record.expiresAt.getTime()) {
    return reject("EXPIRED", `Coupon ${code} expired on ${record.expiresAt.toISOString().slice(0, 10)}.`, {
      expiredOn: record.expiresAt.toISOString().slice(0, 10),
    });
  }
  if (record.singleUse && record.usedAt) {
    return reject("ALREADY_USED", `Coupon ${code} was single-use and has already been used.`);
  }

  const excluded = new Set(record.excludedCategories);
  const eligible = ctx.lines.filter((l) => !excluded.has(l.category));
  const excludedLines = ctx.lines.filter((l) => excluded.has(l.category));
  if (eligible.length === 0) {
    return reject(
      "CATEGORY_EXCLUDED",
      `Coupon ${code} can't be used on ${record.excludedCategories.join(", ").replaceAll("_", " ")}, and everything in the cart is in an excluded category.`,
      { excludedCategories: record.excludedCategories },
    );
  }

  const eligibleSubtotalCents = eligible.reduce((s, l) => s + l.lineTotalCents, 0);
  if (eligibleSubtotalCents < record.minSpendCents) {
    return reject(
      "MIN_SPEND_NOT_MET",
      `Coupon ${code} needs a minimum spend of ${formatCents(record.minSpendCents)} on eligible items; the cart has ${formatCents(eligibleSubtotalCents)}.`,
      {
        minSpend: formatCents(record.minSpendCents),
        eligibleSubtotal: formatCents(eligibleSubtotalCents),
        shortBy: formatCents(record.minSpendCents - eligibleSubtotalCents),
        excludedCategories: record.excludedCategories,
      },
    );
  }

  const discountCents =
    record.kind === "percent"
      ? percentOf(eligibleSubtotalCents, record.value)
      : Math.min(record.value, eligibleSubtotalCents);

  return {
    valid: true,
    code,
    discountCents,
    eligibleSubtotalCents,
    excludedProductIds: excludedLines.map((l) => l.productId),
    description: describeCoupon(record),
  };
}

export function describeCoupon(record: CouponRecord): string {
  const parts = [record.kind === "percent" ? `${record.value}% off` : `${formatCents(record.value)} off`];
  if (record.minSpendCents > 0) parts.push(`minimum spend ${formatCents(record.minSpendCents)}`);
  if (record.excludedCategories.length) {
    parts.push(`not valid on ${record.excludedCategories.join(", ").replaceAll("_", " ")}`);
  }
  if (record.expiresAt) parts.push(`expires ${record.expiresAt.toISOString().slice(0, 10)}`);
  if (record.singleUse) parts.push("single use");
  return parts.join("; ");
}

function reject(
  code: CouponRejectionCode,
  message: string,
  details?: Record<string, unknown>,
): CouponRejection {
  return details ? { valid: false, code, message, details } : { valid: false, code, message };
}
