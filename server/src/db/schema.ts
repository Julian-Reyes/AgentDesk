import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const CATEGORIES = [
  "tents",
  "sleeping_bags",
  "backpacks",
  "stoves",
  "headlamps",
  "jackets",
  "boots",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const categoryEnum = pgEnum("category", CATEGORIES);

/**
 * Specs vary by category, so they live in one JSON column. Every key is
 * optional; the grounding checker (M3) compares replies against these values.
 */
export type ProductSpecs = {
  capacityPersons?: number;
  volumeLiters?: number;
  weightGrams?: number;
  tempRatingC?: number;
  waterproof?: boolean;
  waterproofRatingMm?: number;
  lumens?: number;
  burnTimeMinutes?: number;
  fuel?: string;
  seasons?: number;
  material?: string;
};

// ---------- Catalog ----------

export const products = pgTable("products", {
  id: text("id").primaryKey(), // stable slug, e.g. "tent-ridge-2"
  name: text("name").notNull(),
  category: categoryEnum("category").notNull(),
  description: text("description").notNull(),
  priceCents: integer("price_cents").notNull(),
  rating: doublePrecision("rating").notNull(),
  specs: jsonb("specs").$type<ProductSpecs>().notNull(),
});

export const productVariants = pgTable(
  "product_variants",
  {
    id: text("id").primaryKey(), // e.g. "jacket-squall/M/green"
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    size: text("size"),
    color: text("color"),
    stock: integer("stock").notNull(),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

// ---------- Promotions & coupons ----------

export const promotionTypeEnum = pgEnum("promotion_type", [
  "category_sale",
  "buy2get1",
  "free_shipping",
]);

export type PromotionParams =
  | { type: "category_sale"; category: Category; percentOff: number }
  | { type: "buy2get1"; category: Category }
  | { type: "free_shipping"; thresholdCents: number; flatRateCents: number };

export const promotions = pgTable("promotions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: promotionTypeEnum("type").notNull(),
  params: jsonb("params").$type<PromotionParams>().notNull(),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at"),
});

export const couponKindEnum = pgEnum("coupon_kind", ["percent", "amount"]);
export const couponSourceEnum = pgEnum("coupon_source", ["promo", "goodwill"]);

export const coupons = pgTable("coupons", {
  code: text("code").primaryKey(),
  kind: couponKindEnum("kind").notNull(),
  /** Percent (integer) for kind=percent, cents for kind=amount. */
  value: integer("value").notNull(),
  minSpendCents: integer("min_spend_cents").notNull().default(0),
  excludedCategories: categoryEnum("excluded_categories").array().notNull().default([]),
  expiresAt: ts("expires_at"),
  singleUse: boolean("single_use").notNull().default(false),
  usedAt: ts("used_at"),
  source: couponSourceEnum("source").notNull().default("promo"),
  /** Set for goodwill codes: only this customer may use it. */
  customerId: integer("customer_id").references(() => customers.id),
  createdAt: ts("created_at").notNull(),
});

// ---------- Policies ----------

export const POLICY_TOPICS = [
  "shipping",
  "returns",
  "refunds",
  "warranty",
  "price_match",
  "damaged_items",
  "promotions",
  "goodwill",
] as const;
export type PolicyTopic = (typeof POLICY_TOPICS)[number];
export const policyTopicEnum = pgEnum("policy_topic", POLICY_TOPICS);

export const policies = pgTable("policies", {
  topic: policyTopicEnum("topic").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
});

// ---------- Customers & orders ----------

export const customers = pgTable("customers", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: ts("created_at").notNull(),
});

export const ORDER_STATUSES = [
  "processing",
  "shipped",
  "delivered",
  "delayed",
  "returned",
  "lost",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);

export const orders = pgTable(
  "orders",
  {
    number: integer("number").primaryKey(), // 1001..1400, what customers see as "#1042"
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    status: orderStatusEnum("status").notNull(),
    placedAt: ts("placed_at").notNull(),
    deliveredAt: ts("delivered_at"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    totalPaidCents: integer("total_paid_cents").notNull(),
    couponCode: text("coupon_code"),
  },
  (t) => [index("orders_customer_idx").on(t.customerId)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: integer("id").primaryKey(),
    orderNumber: integer("order_number")
      .notNull()
      .references(() => orders.number),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    variantId: text("variant_id")
      .notNull()
      .references(() => productVariants.id),
    qty: integer("qty").notNull(),
    /** List price per unit at the time of purchase. */
    unitPriceCents: integer("unit_price_cents").notNull(),
    /** Automatic-promotion discount on this line (sale, buy-2-get-1); sums to orders.discount_cents. */
    discountCents: integer("discount_cents").notNull().default(0),
    returnedQty: integer("returned_qty").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderNumber)],
);

export const trackingEvents = pgTable(
  "tracking_events",
  {
    id: serial("id").primaryKey(),
    orderNumber: integer("order_number")
      .notNull()
      .references(() => orders.number),
    at: ts("at").notNull(),
    status: text("status").notNull(),
    location: text("location").notNull(),
    note: text("note"),
  },
  (t) => [index("tracking_order_idx").on(t.orderNumber)],
);

// ---------- Actions the agents can take ----------

export const REFUND_REASONS = ["damaged", "lost", "return", "late"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];
export const refundReasonEnum = pgEnum("refund_reason", REFUND_REASONS);
export const refundStatusEnum = pgEnum("refund_status", [
  "issued",
  "pending_approval",
  "rejected",
]);

export const approvalKindEnum = pgEnum("approval_kind", ["refund", "goodwill_coupon"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"]);

/** Everything over an automatic limit lands here for a human (M4 dashboard). */
export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  kind: approvalKindEnum("kind").notNull(),
  status: approvalStatusEnum("status").notNull().default("pending"),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  orderNumber: integer("order_number").references(() => orders.number),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  reason: text("reason").notNull(),
  createdAt: ts("created_at").notNull(),
  decidedBy: text("decided_by"),
  decidedAt: ts("decided_at"),
  decisionNote: text("decision_note"),
  /** The conversation (runs.id) whose tool call queued this. No FK, like the traces: the seed truncates store tables, never runs. */
  runId: text("run_id"),
});

export const refunds = pgTable(
  "refunds",
  {
    id: serial("id").primaryKey(),
    orderNumber: integer("order_number")
      .notNull()
      .references(() => orders.number),
    amountCents: integer("amount_cents").notNull(),
    reason: refundReasonEnum("reason").notNull(),
    note: text("note"),
    status: refundStatusEnum("status").notNull(),
    approvalId: integer("approval_id").references(() => approvals.id),
    /** The damaged item this refund is for (null for lost/late refunds and warehouse return refunds). */
    orderItemId: integer("order_item_id").references(() => orderItems.id),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("refunds_order_idx").on(t.orderNumber)],
);

export const escalations = pgTable("escalations", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  orderNumber: integer("order_number").references(() => orders.number),
  reason: text("reason").notNull(),
  createdAt: ts("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// Tracing (M2). Every conversation is a run; everything that happens in it is
// a step. There are deliberately no foreign keys to store tables: the seed
// truncates those, and eval runs reset store state per conversation, but the
// traces must survive both.

export const RUN_OUTCOMES = ["resolved", "escalated", "approval_needed", "failed"] as const;

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  /** Where the conversation came from: cli, eval, demo, test. */
  source: text("source").notNull(),
  /** The signed-in customer, if any (no FK, see above). */
  customerId: integer("customer_id"),
  /** Which model config and prompt version each role used, e.g. {router: {model, prompt}, ...}. */
  team: jsonb("team").$type<Record<string, unknown>>().notNull(),
  /** Free-form labels, e.g. the eval case id. */
  labels: jsonb("labels").$type<Record<string, unknown>>().notNull().default({}),
  startedAt: ts("started_at").notNull(),
  endedAt: ts("ended_at"),
  outcome: text("outcome").$type<(typeof RUN_OUTCOMES)[number]>(),
  turns: integer("turns").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  /** Model cost in micro-dollars (1e-6 USD), an integer like all money here. */
  costMicros: integer("cost_micros").notNull().default(0),
});

export const runSteps = pgTable(
  "run_steps",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    turn: integer("turn").notNull(),
    /** user_message | router | model_call | tool_call | handoff | reply | reply_rejected | error */
    kind: text("kind").notNull(),
    agent: text("agent"),
    modelConfigId: text("model_config_id"),
    provider: text("provider"),
    promptVersion: text("prompt_version"),
    /** The step's payload: messages, tool args/results, router decision, error details. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    cached: boolean("cached"),
    policyDecision: text("policy_decision"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("run_steps_run_idx").on(t.runId, t.seq)],
);

// ---------------------------------------------------------------------------
// The agent team (M4). Which model each role uses lives here, as an
// append-only history: the current team is the latest row per role. Like the
// traces, it's not store data, so `db:seed` never truncates it.

export const TEAM_ROLES = ["router", "shopping", "support"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export const TEAM_ACTIONS = ["initial", "switch", "retire", "reinstate"] as const;
export type TeamAction = (typeof TEAM_ACTIONS)[number];
export const teamRoleEnum = pgEnum("team_role", TEAM_ROLES);
export const teamActionEnum = pgEnum("team_action", TEAM_ACTIONS);

export const teamChanges = pgTable(
  "team_changes",
  {
    id: serial("id").primaryKey(),
    role: teamRoleEnum("role").notNull(),
    action: teamActionEnum("action").notNull(),
    /** The model the action is about: the new one (initial, switch), the retired one, the reinstated one. */
    model: text("model").notNull(),
    /** The role's model before and after the action. to_model is never null, so the latest row always says what's current. */
    fromModel: text("from_model"),
    toModel: text("to_model").notNull(),
    reason: text("reason").notNull(),
    decidedBy: text("decided_by").notNull(),
    at: ts("at").notNull(),
  },
  (t) => [index("team_changes_role_idx").on(t.role, t.id)],
);
