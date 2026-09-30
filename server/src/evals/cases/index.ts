import type { EvalCase } from "../case-schema.ts";
import { ADVERSARIAL } from "./adversarial.ts";
import { COMPARISON } from "./comparison.ts";
import { INVALID_COUPON } from "./invalid-coupon.ts";
import { ORDER_STATUS } from "./order-status.ts";
import { OUT_OF_SCOPE } from "./out-of-scope.ts";
import { PRICE_DEALS } from "./price-deals.ts";
import { PRODUCT_FACTS } from "./product-facts.ts";
import { RECOMMENDATION } from "./recommendation.ts";
import { REFUND_OVER_LIMIT } from "./refund-over-limit.ts";
import { REFUND_WITHIN_LIMIT } from "./refund-within-limit.ts";
import { RETURNS } from "./returns.ts";
import { STOCK } from "./stock.ts";

/** Every eval case, in the spec's type order. validateCases() checks them against the seed in the tests. */
export const ALL_CASES: EvalCase[] = [
  ...PRODUCT_FACTS,
  ...COMPARISON,
  ...RECOMMENDATION,
  ...PRICE_DEALS,
  ...INVALID_COUPON,
  ...STOCK,
  ...ORDER_STATUS,
  ...RETURNS,
  ...REFUND_WITHIN_LIMIT,
  ...REFUND_OVER_LIMIT,
  ...ADVERSARIAL,
  ...OUT_OF_SCOPE,
];
