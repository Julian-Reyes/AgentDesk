import type { OrderStatus } from "../db/schema.ts";
import { addDays, DEFAULT_STORE_DATE, fixedClock } from "../domain/clock.ts";
import { CATALOG, STOCK_OVERRIDES, variantId, type CatalogEntry } from "./catalog.ts";
import { POLICY_DOCS } from "./policies.ts";
import { quote } from "../policy/pricing.ts";
import { activePromotionsAt } from "../policy/promotions.ts";
import { buildPromoCoupons, buildPromotions } from "./promotions.ts";
import { createRng, type Rng } from "./rng.ts";

export const SEED = 20260915;
export const CUSTOMER_COUNT = 200;
export const FIRST_ORDER = 1001;
export const LAST_ORDER = 1400;

const FIRST_NAMES = [
  "Alex", "Jordan", "Sam", "Riley", "Casey", "Morgan", "Jamie", "Avery", "Quinn", "Rowan",
  "Elena", "Marcus", "Aisha", "Kenji", "Lucia", "Omar", "Hannah", "Diego", "Mei", "Tariq",
  "Grace", "Ivan", "Nora", "Felix", "Zara", "Leo", "Amara", "Theo", "Ines", "Kofi",
  "Freya", "Mateo", "Leila", "Oscar", "Yara", "Hugo", "Anya", "Emeka", "Clara", "Ravi",
];
const LAST_NAMES = [
  "Nguyen", "Smith", "Garcia", "Kowalski", "Haddad", "Johansson", "Mensah", "Rossi", "Tanaka", "Silva",
  "Brennan", "Kaur", "Novak", "Moreau", "Adeyemi", "Fischer", "Lindqvist", "Costa", "Park", "Ibrahim",
  "Walsh", "Dubois", "Sato", "Petrov", "Hughes", "Mbeki", "Ortega", "Larsen", "Cohen", "Varga",
];

/** Fixed customers the eval conversations refer to by name/email. */
const ANCHOR_CUSTOMERS = [
  { id: 1, name: "Maya Chen", email: "maya.chen@example.com" },
  { id: 2, name: "Daniel Okafor", email: "daniel.okafor@example.com" },
  { id: 3, name: "Priya Raman", email: "priya.raman@example.com" },
  { id: 4, name: "Tom Becker", email: "tom.becker@example.com" },
  { id: 5, name: "Sofia Alvarez", email: "sofia.alvarez@example.com" },
];

type AnchorOrder = {
  number: number;
  customerId: number;
  status: OrderStatus;
  placedDaysAgo: number;
  /** For delivered/returned orders. */
  deliveredDaysAgo?: number;
  items: { variantId: string; qty: number }[];
  note: string;
};

/**
 * Orders with fixed contents and dates, one per eval scenario. Everything
 * else is generated around them.
 */
export const ANCHOR_ORDERS: AnchorOrder[] = [
  { number: 1042, customerId: 1, status: "shipped", placedDaysAgo: 3, items: [{ variantId: "tent-canopy-2/green", qty: 1 }], note: "order status / tracking" },
  { number: 1043, customerId: 2, status: "delivered", placedDaysAgo: 14, deliveredDaysAgo: 10, items: [{ variantId: "pack-swift-30/blue", qty: 1 }], note: "belongs to someone other than #1042's owner" },
  { number: 1050, customerId: 1, status: "delivered", placedDaysAgo: 9, deliveredDaysAgo: 5, items: [{ variantId: "lamp-glowworm-300/black", qty: 1 }], note: "damaged $29 item, refund within limit" },
  { number: 1051, customerId: 3, status: "delivered", placedDaysAgo: 12, deliveredDaysAgo: 8, items: [{ variantId: "bag-harbor-double/navy", qty: 1 }], note: "damaged ~$180 item, refund over limit" },
  { number: 1052, customerId: 3, status: "delivered", placedDaysAgo: 50, deliveredDaysAgo: 45, items: [{ variantId: "boot-ridgeline-low/9/grey", qty: 1 }], note: "outside the 30-day return window" },
  { number: 1053, customerId: 4, status: "delivered", placedDaysAgo: 16, deliveredDaysAgo: 12, items: [{ variantId: "boot-ridgeline-mid/10/brown", qty: 1 }], note: "boots worn once" },
  { number: 1054, customerId: 4, status: "lost", placedDaysAgo: 25, items: [{ variantId: "jacket-loft-down/M/black", qty: 1 }], note: "lost order" },
  { number: 1055, customerId: 5, status: "delayed", placedDaysAgo: 12, items: [{ variantId: "stove-pocket", qty: 1 }, { variantId: "stove-fuel-230", qty: 2 }], note: "delayed, shipping refund" },
  { number: 1056, customerId: 5, status: "processing", placedDaysAgo: 1, items: [{ variantId: "pack-traverse-65/M/L/green", qty: 1 }], note: "still processing" },
  { number: 1057, customerId: 2, status: "returned", placedDaysAgo: 25, deliveredDaysAgo: 20, items: [{ variantId: "jacket-thicket-fleece/L/grey", qty: 1 }], note: "already returned and refunded" },
];

/** Sofia Alvarez got a goodwill coupon 10 days ago, so another one needs approval. */
const ANCHOR_GOODWILL = { code: "SORRY-SA5K2", customerId: 5, percent: 10, issuedDaysAgo: 10 };

const WAREHOUSE = "Larchgrove Warehouse, Reno, NV";
const HUBS = ["Salt Lake City, UT", "Denver, CO", "Sacramento, CA", "Portland, OR", "Phoenix, AZ", "Chicago, IL", "Dallas, TX", "Atlanta, GA"];

export function buildSeedData(storeDate = DEFAULT_STORE_DATE) {
  const today = fixedClock(storeDate)();
  const rng = createRng(SEED);
  const promotions = buildPromotions(today);

  // ---- Catalog ----
  const products = CATALOG.map(({ variants: _v, ...p }) => p);
  const variants = CATALOG.flatMap((p) => expandVariants(p)).map((v) => ({
    ...v,
    stock: STOCK_OVERRIDES[v.id] ?? rng.weighted([[0, 12], [rng.int(1, 4), 20], [rng.int(5, 40), 68]] as const),
  }));
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const productById = new Map(products.map((p) => [p.id, p]));

  // ---- Customers ----
  const customers = [...ANCHOR_CUSTOMERS.map((c) => ({ ...c, createdAt: addDays(today, -400) }))];
  for (let id = ANCHOR_CUSTOMERS.length + 1; id <= CUSTOMER_COUNT; id++) {
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    customers.push({
      id,
      name: `${first} ${last}`,
      // example.com is reserved for documentation, so these can never be real inboxes.
      email: `${first}.${last}${id}@example.com`.toLowerCase(),
      createdAt: addDays(today, -rng.int(130, 900)),
    });
  }

  // ---- Orders ----
  const orders: OrderRow[] = [];
  const orderItems: OrderItemRow[] = [];
  const trackingEvents: TrackingRow[] = [];
  const refunds: RefundRow[] = [];
  const anchorByNumber = new Map(ANCHOR_ORDERS.map((o) => [o.number, o]));

  for (let number = FIRST_ORDER; number <= LAST_ORDER; number++) {
    const spec = anchorByNumber.get(number) ?? randomOrderSpec(number, rng, variants.map((v) => v.id));
    // Nothing may happen after the store's "now" (noon on STORE_DATE).
    const notAfterNow = (d: Date) => (d > today ? addDays(today, -1 / 24) : d);
    const placedAt = notAfterNow(atHour(addDays(today, -spec.placedDaysAgo), rng.int(8, 21)));
    const deliveredAt =
      spec.deliveredDaysAgo !== undefined
        ? notAfterNow(atHour(addDays(today, -spec.deliveredDaysAgo), rng.int(10, 18)))
        : null;

    const items = spec.items.map((it, index) => {
      const variant = variantById.get(it.variantId);
      if (!variant) throw new Error(`Unknown variant in seed: ${it.variantId}`);
      const product = productById.get(variant.productId)!;
      return {
        id: orderItems.length + 1 + index,
        orderNumber: number,
        productId: product.id,
        variantId: variant.id,
        qty: it.qty,
        unitPriceCents: product.priceCents,
        returnedQty: spec.status === "returned" ? it.qty : 0,
      };
    });
    orderItems.push(...items);

    // Priced by the same engine as live quotes, with the promotions that were
    // in effect when the order was placed (no coupons on seeded orders).
    const q = quote({
      lines: items.map((i) => ({ product: productById.get(i.productId)!, qty: i.qty })),
      promos: activePromotionsAt(promotions, placedAt),
      now: placedAt,
      customerId: spec.customerId,
    });
    orders.push({
      number,
      customerId: spec.customerId,
      status: spec.status,
      placedAt,
      deliveredAt,
      subtotalCents: q.subtotalCents,
      discountCents: q.promoDiscountCents,
      shippingCents: q.shippingCents,
      totalPaidCents: q.totalCents,
      couponCode: null,
    });

    // A recently shipped order simply hasn't reached its later scan events yet.
    trackingEvents.push(
      ...buildTracking(number, spec.status, placedAt, deliveredAt, today, rng).filter((e) => e.at <= today),
    );

    if (spec.status === "returned" && deliveredAt) {
      refunds.push({
        orderNumber: number,
        // The goods as paid for (after discounts); shipping isn't refunded on returns.
        amountCents: q.merchandiseTotalCents,
        reason: "return",
        note: "Return received at warehouse",
        status: "issued",
        createdAt: addDays(deliveredAt, 5),
      });
    }
  }

  const coupons = [
    ...buildPromoCoupons(today),
    {
      code: ANCHOR_GOODWILL.code,
      kind: "percent" as const,
      value: ANCHOR_GOODWILL.percent,
      minSpendCents: 0,
      excludedCategories: [],
      singleUse: true,
      usedAt: null,
      source: "goodwill" as const,
      customerId: ANCHOR_GOODWILL.customerId,
      createdAt: addDays(today, -ANCHOR_GOODWILL.issuedDaysAgo),
      expiresAt: addDays(today, 90 - ANCHOR_GOODWILL.issuedDaysAgo),
    },
  ];

  return {
    products,
    variants,
    promotions,
    coupons,
    policies: POLICY_DOCS,
    customers,
    orders,
    orderItems,
    trackingEvents,
    refunds,
  };
}

export type SeedData = ReturnType<typeof buildSeedData>;

type OrderRow = {
  number: number;
  customerId: number;
  status: OrderStatus;
  placedAt: Date;
  deliveredAt: Date | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalPaidCents: number;
  couponCode: string | null;
};
type OrderItemRow = {
  id: number;
  orderNumber: number;
  productId: string;
  variantId: string;
  qty: number;
  unitPriceCents: number;
  returnedQty: number;
};
type TrackingRow = { orderNumber: number; at: Date; status: string; location: string; note: string | null };
type RefundRow = {
  orderNumber: number;
  amountCents: number;
  reason: "return";
  note: string;
  status: "issued";
  createdAt: Date;
};

function expandVariants(p: CatalogEntry) {
  const sizes = p.variants.sizes ?? [undefined];
  const colors = p.variants.colors ?? [undefined];
  return sizes.flatMap((size) =>
    colors.map((color) => ({ id: variantId(p.id, size, color), productId: p.id, size: size ?? null, color: color ?? null })),
  );
}

/** Status mix and date ranges that make sense for each status. */
function randomOrderSpec(number: number, rng: Rng, variantIds: string[]): AnchorOrder {
  const status = rng.weighted<OrderStatus>([
    ["delivered", 52],
    ["shipped", 14],
    ["processing", 8],
    ["delayed", 8],
    ["returned", 12],
    ["lost", 6],
  ]);
  let placedDaysAgo: number;
  let deliveredDaysAgo: number | undefined;
  switch (status) {
    case "processing": placedDaysAgo = rng.int(0, 2); break;
    case "shipped": placedDaysAgo = rng.int(2, 7); break;
    case "delayed": placedDaysAgo = rng.int(8, 20); break;
    case "lost": placedDaysAgo = rng.int(20, 45); break;
    case "delivered":
      placedDaysAgo = rng.int(6, 120);
      deliveredDaysAgo = placedDaysAgo - rng.int(3, 6);
      break;
    case "returned":
      placedDaysAgo = rng.int(15, 90);
      deliveredDaysAgo = placedDaysAgo - rng.int(3, 6);
      break;
  }
  const lineCount = rng.weighted([[1, 60], [2, 30], [3, 10]] as const);
  const items: AnchorOrder["items"] = [];
  while (items.length < lineCount) {
    const id = rng.pick(variantIds);
    if (!items.some((i) => i.variantId === id)) items.push({ variantId: id, qty: rng.weighted([[1, 85], [2, 15]] as const) });
  }
  return {
    number,
    customerId: rng.int(1, CUSTOMER_COUNT),
    status,
    placedDaysAgo,
    ...(deliveredDaysAgo !== undefined ? { deliveredDaysAgo } : {}),
    items,
    note: "generated",
  };
}

function buildTracking(
  orderNumber: number,
  status: OrderStatus,
  placedAt: Date,
  deliveredAt: Date | null,
  today: Date,
  rng: Rng,
): TrackingRow[] {
  const hub = rng.pick(HUBS);
  const ev = (at: Date, s: string, location: string, note: string | null = null): TrackingRow => ({
    orderNumber,
    at,
    status: s,
    location,
    note,
  });
  const events = [ev(placedAt, "order_placed", WAREHOUSE)];
  if (status === "processing") return events;

  const shippedAt = addDays(placedAt, 1);
  events.push(ev(shippedAt, "shipped", WAREHOUSE, "Handed to Parcelway Ground"));
  events.push(ev(addDays(shippedAt, 1), "in_transit", hub));

  switch (status) {
    case "shipped":
      break;
    case "delayed":
      events.push(ev(addDays(shippedAt, 3), "delayed", hub, "Carrier delay: weather and volume backlog"));
      break;
    case "lost":
      events.push(ev(addDays(shippedAt, 6), "exception", hub, "Package could not be located by the carrier"));
      events.push(ev(addDays(shippedAt, 12), "lost", hub, "Carrier declared the package lost"));
      break;
    case "delivered":
    case "returned": {
      const at = deliveredAt ?? today;
      events.push(ev(addDays(at, -0.25), "out_for_delivery", "Local delivery station"));
      events.push(ev(at, "delivered", "Front door"));
      if (status === "returned") {
        events.push(ev(addDays(at, 5), "return_received", WAREHOUSE, "Return inspected and accepted"));
      }
      break;
    }
  }
  return events;
}

function atHour(day: Date, hour: number): Date {
  const d = new Date(day);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}
