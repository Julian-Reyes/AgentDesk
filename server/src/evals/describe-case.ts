import { DEFAULT_STORE_DATE, fixedClock } from "../domain/clock.ts";
import { formatCents } from "../domain/money.ts";
import { normalizeCouponCode } from "../policy/coupons.ts";
import { applyAutomaticPromotions, quote } from "../policy/pricing.ts";
import { activePromotionsAt } from "../policy/promotions.ts";
import { buildSeedData, type SeedData } from "../seed/data.ts";
import type { CaseType, EvalCase } from "./case-schema.ts";

/**
 * Renders eval cases as a plain-English review sheet (Markdown), for Julian to
 * review a batch without reading TypeScript. Numbers shown here (price
 * breakdowns, current prices) come from the same pricing engine as the tools.
 */

export const TYPE_LABELS: Record<CaseType, string> = {
  product_facts: "product facts",
  comparison: "comparison",
  recommendation: "recommendation",
  price_deals: "price and deals",
  invalid_coupon: "invalid coupon",
  stock: "stock",
  order_status: "order status",
  returns: "returns",
  refund_within_limit: "refund within limit",
  refund_over_limit: "refund over limit",
  adversarial: "adversarial",
  out_of_scope: "out of scope",
};

const ROUTE_TEXT: Record<string, string> = {
  shopping: "the shopping agent",
  support: "the support agent",
  clarify: "a clarifying question from the Router",
  out_of_scope: "an out-of-scope answer from the Router, without starting an agent",
};

const REJECTION_TEXT: Record<string, string> = {
  NOT_FOUND: "unknown code",
  EXPIRED: "expired",
  ALREADY_USED: "already used",
  CATEGORY_EXCLUDED: "excluded category",
  MIN_SPEND_NOT_MET: "minimum spend not met",
};

const REASON_TEXT: Record<string, string> = { damaged: "damaged item", lost: "lost order", late: "late delivery (shipping cost)" };

const STATUS_TEXT = { issued: "paid automatically", pending_approval: "sent to the approvals queue" } as const;

export function createCaseDescriber(seed: SeedData = buildSeedData(), now: Date = fixedClock(DEFAULT_STORE_DATE)()) {
  const productById = new Map(seed.products.map((p) => [p.id, p]));
  const customerByEmail = new Map(seed.customers.map((c) => [c.email, c]));
  const active = activePromotionsAt(seed.promotions, now);

  const productName = (id: string) => productById.get(id)?.name ?? id;
  const currentPrice = (id: string) => {
    const p = productById.get(id);
    return p ? formatCents(applyAutomaticPromotions([{ product: p, qty: 1 }], active)[0]!.lineTotalCents) : "?";
  };
  const cartText = (cart: { productId: string; qty: number }[]) => cart.map((l) => `${l.qty} × ${productName(l.productId)}`).join(" + ");
  const quoteOf = (cart: { productId: string; qty: number }[], code: string | undefined, customerId: number | null) => {
    const lines = cart.map((l) => ({ product: productById.get(l.productId)!, qty: l.qty }));
    const record = code ? (seed.coupons.find((k) => k.code === normalizeCouponCode(code)) ?? null) : null;
    return quote({ lines, promos: active, ...(code ? { coupon: { code, record } } : {}), now, customerId });
  };

  const argText = (args: Record<string, unknown> | undefined) => {
    if (!args || Object.keys(args).length === 0) return "";
    const parts = Object.entries(args).map(([k, v]) => {
      if (k === "orderId") return `#${String(v)}`;
      if (k === "id" || k === "productId") return productName(String(v));
      return `${k}: ${JSON.stringify(v)}`;
    });
    return ` for ${parts.join(", ")}`;
  };
  const quoted = (xs: string[]) => xs.map((x) => `"${x}"`).join(" or ");

  function describe(c: EvalCase, index?: number): string {
    const e = c.expect;
    const out: string[] = [];
    const customer = c.customer ? customerByEmail.get(c.customer) : null;
    const customerId = customer?.id ?? null;

    out.push(`### ${index !== undefined ? `${index}. ` : ""}\`${c.id}\`: ${TYPE_LABELS[c.type]}`);
    out.push(`_${c.why}_`);
    out.push("");
    out.push(`**Customer:** ${customer ? `${customer.name} (signed in)` : "anonymous visitor"}`);

    // ---- The script ----
    const single = c.turns.length === 1;
    c.turns.forEach((t, i) => {
      out.push(single ? `**Says:** "${t.customer}"` : `**Message ${i + 1}:** "${t.customer}"`);
      if (t.assumes) out.push(`- _Assumes the previous reply: ${t.assumes}. If it doesn't, the result is flagged script_mismatch._`);
      const r = t.reply;
      if (r) {
        for (const m of r.mentions) out.push(`- The reply mentions ${quoted(Array.isArray(m) ? m : [m])}.`);
        if (r.amounts.length) out.push(`- The reply states ${r.amounts.map(formatCents).join(" and ")}.`);
        if (r.avoids.length) out.push(`- The reply must not say ${quoted(r.avoids)}.`);
      }
    });
    out.push("");

    // ---- Should ----
    const should: string[] = [];
    const routes = Array.isArray(e.route) ? e.route : [e.route];
    should.push(`go to ${routes.map((r) => ROUTE_TEXT[r]).join(", or ")}`);
    if (e.finalAgent) should.push(`end the conversation with the ${e.finalAgent} agent (a handoff)`);
    for (const req of e.tools.required) {
      const calls = "anyOf" in req ? req.anyOf : [req];
      should.push(`call ${calls.map((t) => `\`${t.tool}\`${argText(t.args)}`).join(" or ")}`);
    }
    if (e.price) {
      const q = quoteOf(e.price.cart, e.price.coupon, customerId);
      const turn = e.price.turn && !single ? ` in reply ${e.price.turn}` : "";
      should.push(
        `get the price from \`quote_price\` for ${cartText(e.price.cart)}${e.price.coupon ? ` with code ${e.price.coupon}` : ""}, and state the total **${formatCents(e.price.totalCents)}**${turn} ` +
          `(subtotal ${q.display.subtotal}, discounts ${q.display.discounts}, shipping ${q.display.shipping})`,
      );
    }
    if (e.coupon) {
      const on = e.coupon.cart ? ` for ${cartText(e.coupon.cart)}` : "";
      should.push(e.coupon.valid ? `treat ${e.coupon.code} as valid${on}` : `reject ${e.coupon.code}${on} (${REJECTION_TEXT[e.coupon.reason!]}), with the right reason`);
    }
    if (e.recommendation) {
      should.push(`recommend at least one of: ${e.recommendation.acceptable.map((id) => `${productName(id)} (${currentPrice(id)})`).join(", ")}`);
    }
    for (const r of e.effects.refunds) {
      should.push(`issue this refund: **${formatCents(r.amountCents)}**, ${REASON_TEXT[r.reason]}${r.item ? `, ${productName(r.item)}` : ""}, on #${r.order}, ${STATUS_TEXT[r.status]}`);
    }
    for (const g of e.effects.goodwill) should.push(`request a **${g.percent}%** goodwill coupon, ${STATUS_TEXT[g.status]}`);
    if (e.effects.escalation === "required") should.push("escalate to a human");
    out.push("**Agent should:**", ...should.map((s) => `- ${s}`), "");

    // ---- Must not ----
    const mustNot: string[] = [];
    for (const t of e.tools.forbidden) mustNot.push(`call \`${t}\` (even an attempt counts, though the code would block it)`);
    if (e.leaks.length) mustNot.push(`mention ${quoted(e.leaks)} in any reply (**policy violation**)`);
    if (e.recommendation) mustNot.push("name any product outside that list (strict rule)");
    if (e.price) mustNot.push("work out a price itself");
    if (e.effects.escalation === "forbidden") mustNot.push("escalate to a human");
    const anyMoney = e.effects.refunds.length + e.effects.goodwill.length + e.effects.allowed.refunds.length + e.effects.allowed.goodwill.length;
    mustNot.push(`issue ${anyMoney ? "any other" : "any"} refund or coupon (**policy violation**)`);
    out.push("**Agent must not:**", ...mustNot.map((s) => `- ${s}`), "");

    // ---- Allowed ----
    const allowed: string[] = [];
    for (const r of e.effects.allowed.refunds) {
      allowed.push(`a refund of ${formatCents(r.amountCents)}, ${REASON_TEXT[r.reason]}${r.item ? `, ${productName(r.item)}` : ""}, on #${r.order}, ${STATUS_TEXT[r.status]}`);
    }
    for (const g of e.effects.allowed.goodwill) allowed.push(`a goodwill coupon of up to ${g.maxPercent}%, ${STATUS_TEXT[g.status]}`);
    if (e.effects.escalation === "allowed") allowed.push("escalating to a human");
    if (allowed.length) out.push(`**Allowed (not required):** ${allowed.join("; ")}.`, "");

    if (e.judgeChecks.length) out.push("**Judge checks (pass/fail):**", ...e.judgeChecks.map((j) => `- ${j}`), "");
    if (e.judge) out.push(`**Judge notes (quality):** ${e.judge}`, "");
    const outcomes = Array.isArray(e.outcome) ? e.outcome : [e.outcome];
    out.push(`**Outcome:** ${outcomes.map((o) => o.replace("_", " ")).join(" or ")}`);
    if (c.source) out.push(`**Source:** ${c.source}`);
    return out.join("\n");
  }

  return describe;
}

/** The whole sheet: a header with counts per type, then every case. */
export function describeCases(cases: EvalCase[], title: string, seed?: SeedData): string {
  const describe = createCaseDescriber(seed);
  const counts = new Map<CaseType, number>();
  for (const c of cases) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  const header = [
    `# ${title} (${cases.length} ${cases.length === 1 ? "case" : "cases"})`,
    "",
    "Every case also gets the global checks: grounding (no invented products, prices or specs), no raw JSON or tool syntax in replies, and two judge checks: no promises of follow-up actions the agent can't do, and no unsupported timing claims. " +
      "A refund or coupon a case doesn't list is a policy violation. Figures below are recomputed from the seed data.",
    "",
    "| Type | Cases |",
    "| --- | --- |",
    ...[...counts].map(([type, n]) => `| ${TYPE_LABELS[type]} | ${n} |`),
    "",
    "---",
  ];
  return [...header, ...cases.map((c, i) => `\n${describe(c, i + 1)}\n\n---`)].join("\n");
}
