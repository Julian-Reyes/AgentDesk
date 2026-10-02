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
import { TEST_ADVERSARIAL } from "./test/adversarial.ts";
import { TEST_COMPARISON } from "./test/comparison.ts";
import { TEST_PRICE_DEALS } from "./test/price-deals.ts";
import { TEST_PRODUCT_FACTS } from "./test/product-facts.ts";
import { TEST_RECOMMENDATION } from "./test/recommendation.ts";
import { TEST_STOCK } from "./test/stock.ts";
import { TEST_INVALID_COUPON } from "./test/invalid-coupon.ts";
import { TEST_ORDER_STATUS } from "./test/order-status.ts";
import { TEST_OUT_OF_SCOPE } from "./test/out-of-scope.ts";
import { TEST_REFUND_OVER_LIMIT } from "./test/refund-over-limit.ts";
import { TEST_REFUND_WITHIN_LIMIT } from "./test/refund-within-limit.ts";
import { TEST_RETURNS } from "./test/returns.ts";

/** The test split (drafted in batches by type; never tuned on). */
export const TEST_CASES: EvalCase[] = [
  ...TEST_PRODUCT_FACTS,
  ...TEST_COMPARISON,
  ...TEST_RECOMMENDATION,
  ...TEST_PRICE_DEALS,
  ...TEST_STOCK,
  ...TEST_RETURNS,
  ...TEST_REFUND_WITHIN_LIMIT,
  ...TEST_REFUND_OVER_LIMIT,
  ...TEST_ORDER_STATUS,
  ...TEST_INVALID_COUPON,
  ...TEST_ADVERSARIAL,
  ...TEST_OUT_OF_SCOPE,
];

/** Every eval case: the dev split in the spec's type order, then the test split. validateCases() checks them against the seed in the tests. */
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
  ...TEST_CASES,
];
