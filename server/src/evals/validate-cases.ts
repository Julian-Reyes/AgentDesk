import { DEFAULT_STORE_DATE, fixedClock } from "../domain/clock.ts";
import { normalizeCouponCode } from "../policy/coupons.ts";
import { decideGoodwill } from "../policy/goodwill.ts";
import { applyAutomaticPromotions, quote, type CartLine } from "../policy/pricing.ts";
import { activePromotionsAt } from "../policy/promotions.ts";
import { decideRefund } from "../policy/refunds.ts";
import { buildSeedData, type SeedData } from "../seed/data.ts";
import type { EvalCase } from "./case-schema.ts";

type RefundEffect = EvalCase["expect"]["effects"]["refunds"][number];

/**
 * Checks eval cases against the seed data, so a case can't expect something the
 * store can't produce: an unknown product, someone else's refund, a price total
 * the pricing engine wouldn't give, a refund status the refund rules wouldn't
 * give, a recommendation list that doesn't match the catalog.
 *
 * Every expected value is recomputed with the same pure policy functions the
 * tools use (quote, decideRefund, decideGoodwill). Returns a list of problems,
 * each prefixed with the case id; empty means all good.
 */
export function validateCases(cases: EvalCase[], seed: SeedData = buildSeedData(), now: Date = fixedClock(DEFAULT_STORE_DATE)()): string[] {
  const problems: string[] = [];
  const productById = new Map(seed.products.map((p) => [p.id, p]));
  const customerByEmail = new Map(seed.customers.map((c) => [c.email, c]));
  const orderByNumber = new Map(seed.orders.map((o) => [o.number, o]));
  const active = activePromotionsAt(seed.promotions, now);

  const seen = new Set<string>();
  for (const c of cases) {
    const problem = (msg: string) => problems.push(`${c.id}: ${msg}`);
    if (seen.has(c.id)) problem("duplicate id");
    seen.add(c.id);

    // ---- Customer ----
    let customerId: number | null = null;
    if (c.customer !== null) {
      const customer = customerByEmail.get(c.customer);
      if (!customer) problem(`unknown customer ${c.customer}`);
      else customerId = customer.id;
    }
    const e = c.expect;
    const anyMoney = e.effects.refunds.length + e.effects.goodwill.length + e.effects.allowed.refunds.length + e.effects.allowed.goodwill.length;
    if (c.customer === null && anyMoney) {
      problem("an anonymous visitor can't receive refunds or coupons");
    }

    // ---- Product and order references ----
    const productRefs = [
      ...toolArgValues(c, "productId"),
      ...toolArgValues(c, "id"),
      ...(e.price?.cart.map((l) => l.productId) ?? []),
      ...(e.coupon?.cart?.map((l) => l.productId) ?? []),
      ...(e.recommendation?.acceptable ?? []),
      ...[...e.effects.refunds, ...e.effects.allowed.refunds].flatMap((r) => (r.item ? [r.item] : [])),
    ];
    for (const id of productRefs) if (!productById.has(String(id))) problem(`unknown product ${String(id)}`);
    // Tool args may name any existing order (asking for someone else's is a test);
    // refunds must be on the customer's own orders.
    for (const n of toolArgValues(c, "orderId")) if (!orderByNumber.has(Number(n))) problem(`unknown order ${String(n)}`);

    // ---- Price and coupon ----
    const quoteCart = (cart: { productId: string; qty: number }[], code: string | undefined) => {
      const merged = new Map<string, number>();
      for (const l of cart) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.qty);
      const lines: CartLine[] = [];
      for (const [id, qty] of merged) {
        const product = productById.get(id);
        if (!product) return null; // already reported as an unknown product
        lines.push({ product, qty });
      }
      const record = code ? (seed.coupons.find((k) => k.code === normalizeCouponCode(code)) ?? null) : null;
      return quote({ lines, promos: active, ...(code ? { coupon: { code, record } } : {}), now, customerId });
    };
    const priced = e.price ? quoteCart(e.price.cart, e.price.coupon) : null;
    if (e.price && priced && priced.totalCents !== e.price.totalCents) {
      problem(`price total is ${fmt(priced.totalCents)} per quote(), case says ${fmt(e.price.totalCents)}`);
    }
    if (e.coupon) {
      const k = e.coupon;
      let q = null;
      if (k.cart) q = quoteCart(k.cart, k.code);
      else if (!e.price?.coupon || normalizeCouponCode(e.price.coupon) !== normalizeCouponCode(k.code)) {
        problem(`coupon check is for ${k.code} but the price check uses ${e.price?.coupon ?? "no coupon"}`);
      } else q = priced;
      if (q?.coupon) {
        if (q.coupon.applied !== k.valid) {
          problem(`coupon ${k.code} is ${q.coupon.applied ? "valid" : "invalid"} for this cart, case says ${k.valid ? "valid" : "invalid"}`);
        } else if (!q.coupon.applied && q.coupon.rejection.code !== k.reason) {
          problem(`coupon ${k.code} is rejected with ${q.coupon.rejection.code}, case says ${k.reason}`);
        }
      }
    }

    // ---- Refunds: replay them in order through the refund rules ----
    // Required ones happen in order, each on top of the previous. Allowed ones may
    // or may not happen, so each is checked on its own, after all the required ones.
    const pendingByOrder = new Map<number, number>();
    const issuedByOrder = new Map<number, number>();
    const refundedByItem = new Map<number, number>();
    const checkRefund = (r: RefundEffect, kind: string, commit: boolean) => {
      const order = orderByNumber.get(r.order);
      if (!order) return problem(`${kind} refund on unknown order ${r.order}`);
      if (order.customerId !== customerId) return problem(`${kind} refund on order ${r.order}, which isn't ${c.customer ?? "the anonymous visitor"}'s`);
      const seededIssued = seed.refunds.filter((x) => x.orderNumber === r.order).reduce((n, x) => n + x.amountCents, 0);
      let item;
      let itemId: number | undefined;
      if (r.item) {
        const line = seed.orderItems.find((i) => i.orderNumber === r.order && i.productId === r.item);
        if (!line) return problem(`order ${r.order} has no item ${r.item}`);
        itemId = line.id;
        const paid = line.unitPriceCents * line.qty - line.discountCents;
        const keptPaid = Math.floor((paid * (line.qty - line.returnedQty)) / line.qty);
        item = { name: r.item, paidCents: paid, refundableCents: keptPaid - (refundedByItem.get(line.id) ?? 0) };
      }
      const decision = decideRefund(
        { ...order, issuedCents: seededIssued + (issuedByOrder.get(r.order) ?? 0), pendingCents: pendingByOrder.get(r.order) ?? 0 },
        r.reason,
        r.amountCents,
        now,
        item,
      );
      const expected = r.status === "issued" ? "auto_approved" : "queued_for_approval";
      if (decision.decision !== expected) {
        const detail = decision.decision === "denied" ? `denied (${decision.code})` : decision.decision;
        problem(`${kind} refund of ${fmt(r.amountCents)} on ${r.order} would be ${detail} by the refund rules, case says ${r.status}`);
      }
      if (!commit) return;
      const bucket = r.status === "issued" ? issuedByOrder : pendingByOrder;
      bucket.set(r.order, (bucket.get(r.order) ?? 0) + r.amountCents);
      if (itemId !== undefined) refundedByItem.set(itemId, (refundedByItem.get(itemId) ?? 0) + r.amountCents);
    };
    for (const r of e.effects.refunds) checkRefund(r, "required", true);
    for (const r of e.effects.allowed.refunds) checkRefund(r, "allowed", false);

    // ---- Goodwill coupons (same order: required, then each allowed one at its max percent) ----
    let lastGoodwill =
      seed.coupons
        .filter((k) => k.source === "goodwill" && k.customerId === customerId)
        .map((k) => k.createdAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    let hasPending = false;
    const checkGoodwill = (percent: number, status: "issued" | "pending_approval", kind: string) => {
      const decision = decideGoodwill(percent, { lastIssuedAt: lastGoodwill, hasPending }, now);
      const expected = status === "issued" ? "auto_approved" : "queued_for_approval";
      if (decision.decision !== expected) problem(`${kind} ${percent}% goodwill coupon would be ${decision.decision}, case says ${status}`);
    };
    for (const g of e.effects.goodwill) {
      checkGoodwill(g.percent, g.status, "a required");
      if (g.status === "issued") lastGoodwill = now;
      else hasPending = true;
    }
    for (const g of e.effects.allowed.goodwill) checkGoodwill(g.maxPercent, g.status, "an allowed");

    // ---- Recommendation: the acceptable list must be exactly what the catalog allows ----
    if (e.recommendation) {
      const k = e.recommendation.constraints;
      const stockByProduct = new Map<string, number>();
      for (const v of seed.variants) stockByProduct.set(v.productId, (stockByProduct.get(v.productId) ?? 0) + v.stock);
      const fits = seed.products
        .filter((p) => {
          const sp = p.specs;
          const price = applyAutomaticPromotions([{ product: p, qty: 1 }], active)[0]!.lineTotalCents;
          if (k.category && p.category !== k.category) return false;
          if (k.maxPriceCents !== undefined && price > k.maxPriceCents) return false;
          if (k.minCapacityPersons !== undefined && (sp.capacityPersons ?? 0) < k.minCapacityPersons) return false;
          if (k.maxWeightGrams !== undefined && (sp.weightGrams ?? Infinity) > k.maxWeightGrams) return false;
          if (k.maxTempRatingC !== undefined && (sp.tempRatingC ?? Infinity) > k.maxTempRatingC) return false;
          if (k.waterproof !== undefined && (sp.waterproof ?? false) !== k.waterproof) return false;
          if (k.inStock && (stockByProduct.get(p.id) ?? 0) === 0) return false;
          return true;
        })
        .map((p) => p.id)
        .sort();
      const listed = [...new Set(e.recommendation.acceptable)].sort();
      if (fits.join() !== listed.join()) problem(`acceptable products should be [${fits.join(", ")}], case says [${listed.join(", ")}]`);
    }
  }
  return problems;
}

/** Values of one argument across the case's required tool calls. */
function toolArgValues(c: EvalCase, key: string): unknown[] {
  return c.expect.tools.required
    .flatMap((r) => ("anyOf" in r ? r.anyOf : [r]))
    .flatMap((call) => (call.args && key in call.args ? [call.args[key]] : []));
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
