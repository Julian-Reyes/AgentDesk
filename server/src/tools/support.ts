import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema.ts";
import { addDays } from "../domain/clock.ts";
import { formatCents } from "../domain/money.ts";
import { decideGoodwill, storeCausedProblem, type StoreCausedProblem } from "../policy/goodwill.ts";
import { AGENT_REFUND_REASONS, decideRefund, type RefundItem } from "../policy/refunds.ts";
import { checkReturnEligibility } from "../policy/returns.ts";
import { RULES } from "../policy/rules.ts";
import { day, dollarsArg, findOrderItem, linePaidCents, loadOwnedOrder, orderNumberArg, toCents } from "./common.ts";
import { defineTool, fail, ok, type ToolContext } from "./define.ts";

const CARRIER = "Parcelway";

async function loadSessionCustomer(ctx: ToolContext) {
  if (ctx.session.customerId === null) return null;
  const [c] = await ctx.db.select().from(s.customers).where(eq(s.customers.id, ctx.session.customerId));
  return c ?? null;
}

export const findCustomer = defineTool({
  name: "find_customer",
  description:
    "Look up the signed-in customer's account and order list by email. Only works for the account the customer is signed in with.",
  agents: ["support"],
  args: z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) }),
  async run(ctx, { email }) {
    const customer = await loadSessionCustomer(ctx);
    if (!customer) return fail("AUTH_REQUIRED", "The customer needs to sign in before we can look up an account.");
    // Deliberately the same answer whether or not the other email exists.
    if (customer.email !== email) {
      return fail("NOT_SIGNED_IN_ACCOUNT", "We can only look up the account the customer is signed in with.", undefined, "denied");
    }
    const orders = await ctx.db
      .select({ number: s.orders.number, status: s.orders.status, placedAt: s.orders.placedAt, total: s.orders.totalPaidCents })
      .from(s.orders)
      .where(eq(s.orders.customerId, customer.id))
      .orderBy(desc(s.orders.placedAt));
    return ok({
      name: customer.name,
      email: customer.email,
      orders: orders.map((o) => ({ number: o.number, status: o.status, placed: day(o.placedAt), total: formatCents(o.total) })),
    });
  },
});

export const getOrder = defineTool({
  name: "get_order",
  description:
    "Details of one of the signed-in customer's orders: status, items, amounts paid, refunds. Per item: listPrice (per unit, when purchased), discount and paid (for the whole line, after sales). Use `paid` for what the customer actually spent on an item.",
  agents: ["support"],
  args: z.object({ orderId: orderNumberArg }),
  async run(ctx, { orderId }) {
    const owned = await loadOwnedOrder(ctx, orderId);
    if (!owned.ok) return owned;
    const order = owned.data;
    const items = await ctx.db
      .select({ item: s.orderItems, name: s.products.name, size: s.productVariants.size, color: s.productVariants.color })
      .from(s.orderItems)
      .innerJoin(s.products, eq(s.products.id, s.orderItems.productId))
      .innerJoin(s.productVariants, eq(s.productVariants.id, s.orderItems.variantId))
      .where(eq(s.orderItems.orderNumber, order.number))
      .orderBy(asc(s.orderItems.id));
    const refunds = await ctx.db.select().from(s.refunds).where(eq(s.refunds.orderNumber, order.number)).orderBy(asc(s.refunds.id));

    return ok({
      number: order.number,
      status: order.status,
      placed: day(order.placedAt),
      delivered: day(order.deliveredAt),
      items: items.map(({ item, name, size, color }) => ({
        productId: item.productId,
        name,
        size,
        color,
        qty: item.qty,
        listPrice: formatCents(item.unitPriceCents), // per unit, at the time of purchase
        discount: formatCents(item.discountCents), // for the whole line
        paid: formatCents(item.unitPriceCents * item.qty - item.discountCents), // for the whole line
        returnedQty: item.returnedQty,
      })),
      subtotal: formatCents(order.subtotalCents),
      discount: formatCents(order.discountCents),
      shipping: formatCents(order.shippingCents),
      totalPaid: formatCents(order.totalPaidCents),
      refunds: refunds.map((r) => ({ amount: formatCents(r.amountCents), reason: r.reason, status: r.status, date: day(r.createdAt) })),
    });
  },
});

export const getTracking = defineTool({
  name: "get_tracking",
  description: "Carrier tracking events for one of the signed-in customer's orders.",
  agents: ["support"],
  args: z.object({ orderId: orderNumberArg }),
  async run(ctx, { orderId }) {
    const owned = await loadOwnedOrder(ctx, orderId);
    if (!owned.ok) return owned;
    const order = owned.data;
    const events = await ctx.db
      .select()
      .from(s.trackingEvents)
      .where(eq(s.trackingEvents.orderNumber, order.number))
      .orderBy(asc(s.trackingEvents.at), asc(s.trackingEvents.id));
    const shipped = order.status !== "processing";

    let estimate: string | null = null;
    if (order.status === "shipped") {
      const shippedAt = addDays(order.placedAt, 1);
      estimate = `${day(addDays(shippedAt, 3))} to ${day(addDays(shippedAt, 6))}`;
    }
    return ok({
      orderNumber: order.number,
      status: order.status,
      carrier: shipped ? CARRIER : null,
      // Derived from the order number, so it's stable across reseeds.
      trackingNumber: shipped ? `PW${String(order.number * 7919).padStart(10, "0")}` : null,
      estimatedDelivery: estimate,
      events: events.map((e) => ({ at: e.at.toISOString().slice(0, 16).replace("T", " "), status: e.status, location: e.location, note: e.note })),
    });
  },
});

export const checkReturnEligibilityTool = defineTool({
  name: "check_return_eligibility",
  description:
    "Whether an item from the signed-in customer's order can be returned under the returns policy. Pass the item's product id or name, and the item's condition if the customer mentioned it.",
  agents: ["support"],
  args: z.object({
    orderId: orderNumberArg,
    item: z.string().min(1),
    condition: z.enum(["unused", "used", "damaged"]).optional(),
  }),
  async run(ctx, { orderId, item, condition }) {
    const owned = await loadOwnedOrder(ctx, orderId);
    if (!owned.ok) return owned;
    const order = owned.data;
    const found = await findOrderItem(ctx.db, order.number, item);
    if (!found.ok) return found;
    const match = found.data;
    const result = checkReturnEligibility({
      orderStatus: order.status,
      deliveredAt: order.deliveredAt,
      item: { qty: match.item.qty, returnedQty: match.item.returnedQty },
      ...(condition ? { condition } : {}),
      now: ctx.now,
    });
    return ok({ orderNumber: order.number, item: match.name, ...result }, result.eligible ? "auto_approved" : "denied");
  },
});

export const issueRefund = defineTool({
  name: "issue_refund",
  description: `Refund part or all of one of the signed-in customer's orders. Reasons: damaged (reported within ${RULES.damageReportWindowDays} days of delivery; pass the damaged item, refunded up to what was paid for it), lost (order lost in transit), late (delayed order; shipping cost only). Amount in dollars. The tool decides whether the refund is immediate or goes to a human for approval, and says which. Returns are refunded by the warehouse, not with this tool.`,
  agents: ["support"],
  args: z.object({
    orderId: orderNumberArg,
    amount: dollarsArg,
    reason: z.enum(AGENT_REFUND_REASONS),
    /** Required for "damaged": the item's product id or name. */
    item: z.string().trim().min(1).optional(),
    note: z.string().max(500).optional(),
  }),
  async run(ctx, { orderId, amount, reason, item, note }) {
    const amountCents = toCents(amount);
    return ctx.db.transaction(async (tx) => {
      const tctx = { ...ctx, db: tx };
      const owned = await loadOwnedOrder(tctx, orderId);
      if (!owned.ok) return owned;
      // Lock the order row so two refunds on the same order can't race past the limits.
      await tx.execute(sql`select 1 from ${s.orders} where ${s.orders.number} = ${orderId} for update`);
      const order = owned.data;

      const [sums] = await tx
        .select({
          issued: sql<number>`coalesce(sum(${s.refunds.amountCents}) filter (where ${s.refunds.status} = 'issued'), 0)::int`,
          pending: sql<number>`coalesce(sum(${s.refunds.amountCents}) filter (where ${s.refunds.status} = 'pending_approval'), 0)::int`,
        })
        .from(s.refunds)
        .where(eq(s.refunds.orderNumber, order.number));

      // Damaged refunds are per item: find it, and work out what's still refundable for it.
      let refundItem: RefundItem | undefined;
      let orderItemId: number | null = null;
      if (reason === "damaged" && item) {
        const found = await findOrderItem(tx, order.number, item);
        if (!found.ok) return { ...found, policyDecision: "denied" as const };
        const { item: line, name } = found.data;
        const [itemSums] = await tx
          .select({ refunded: sql<number>`coalesce(sum(${s.refunds.amountCents}) filter (where ${s.refunds.status} in ('issued', 'pending_approval')), 0)::int` })
          .from(s.refunds)
          .where(eq(s.refunds.orderItemId, line.id));
        const paid = linePaidCents(line);
        // Units already returned were refunded by the warehouse; only the rest can be refunded as damaged.
        const keptPaid = Math.floor((paid * (line.qty - line.returnedQty)) / line.qty);
        refundItem = { name, paidCents: paid, qty: line.qty, refundableCents: keptPaid - itemSums!.refunded };
        orderItemId = line.id;
      }

      const decision = decideRefund(
        { ...order, issuedCents: sums!.issued, pendingCents: sums!.pending },
        reason,
        amountCents,
        ctx.now,
        refundItem,
      );

      if (decision.decision === "denied") {
        return fail(decision.code, decision.message, decision.details, "denied");
      }
      if (decision.decision === "auto_approved") {
        const [refund] = await tx
          .insert(s.refunds)
          .values({ orderNumber: order.number, amountCents, reason, note: note ?? null, status: "issued", orderItemId, createdAt: ctx.now })
          .returning();
        return ok(
          {
            status: "refunded",
            refundId: refund!.id,
            amount: formatCents(amountCents),
            message: `Refund of ${formatCents(amountCents)} issued to the original payment method.`,
          },
          "auto_approved",
        );
      }
      const [approval] = await tx
        .insert(s.approvals)
        .values({
          kind: "refund",
          customerId: order.customerId,
          orderNumber: order.number,
          payload: { amountCents, reason, note: note ?? null, ...(refundItem ? { item: refundItem.name, orderItemId } : {}) },
          reason: decision.why,
          createdAt: ctx.now,
        })
        .returning();
      await tx.insert(s.refunds).values({
        orderNumber: order.number,
        amountCents,
        reason,
        note: note ?? null,
        status: "pending_approval",
        approvalId: approval!.id,
        orderItemId,
        createdAt: ctx.now,
      });
      return ok(
        {
          status: "pending_approval",
          approvalId: approval!.id,
          amount: formatCents(amountCents),
          message: `No refund has been issued yet. A ${formatCents(amountCents)} refund request was sent to a team member for approval (usually within one business day).`,
        },
        "queued_for_approval",
      );
    });
  },
});

export const issueGoodwillCoupon = defineTool({
  name: "issue_goodwill_coupon",
  description: `Give the signed-in customer a one-time percent-off coupon as an apology for a problem the store or carrier caused with an order (lost, delayed or damaged), passing that order. Not for customer-side reasons such as a denied return. Up to ${RULES.goodwillMaxPercent}% and one per ${RULES.goodwillCooldownDays} days is immediate when the order has such a problem on record; anything else goes to a human for approval.`,
  agents: ["support"],
  args: z.object({
    customer: z.string().trim().toLowerCase().pipe(z.email()).describe("The signed-in customer's email."),
    /** The order the apology is for. Without one, the request always goes to approval. */
    orderId: orderNumberArg.optional(),
    percent: z.number().int().min(1).max(50),
    reason: z.string().min(3).max(500),
  }),
  async run(ctx, { customer: email, orderId, percent, reason }) {
    return ctx.db.transaction(async (tx) => {
      const tctx = { ...ctx, db: tx };
      const customer = await loadSessionCustomer(tctx);
      if (!customer) return fail("AUTH_REQUIRED", "The customer needs to sign in first.");
      if (customer.email !== email) {
        return fail("NOT_SIGNED_IN_ACCOUNT", "Goodwill coupons can only go to the signed-in customer.", undefined, "denied");
      }
      await tx.execute(sql`select 1 from ${s.customers} where ${s.customers.id} = ${customer.id} for update`);

      const [last] = await tx
        .select({ createdAt: s.coupons.createdAt })
        .from(s.coupons)
        .where(and(eq(s.coupons.customerId, customer.id), eq(s.coupons.source, "goodwill")))
        .orderBy(desc(s.coupons.createdAt))
        .limit(1);
      const [pending] = await tx
        .select({ id: s.approvals.id })
        .from(s.approvals)
        .where(and(eq(s.approvals.customerId, customer.id), eq(s.approvals.kind, "goodwill_coupon"), eq(s.approvals.status, "pending")))
        .limit(1);

      // Whether the store caused a problem comes from the order's record, never from the model's `reason`.
      let problem: StoreCausedProblem | null = null;
      if (orderId !== undefined) {
        const owned = await loadOwnedOrder(tctx, orderId);
        if (!owned.ok) return owned;
        const refunds = await tx
          .select({ reason: s.refunds.reason })
          .from(s.refunds)
          .where(and(eq(s.refunds.orderNumber, orderId), inArray(s.refunds.status, ["issued", "pending_approval"])));
        problem = storeCausedProblem({ status: owned.data.status, refundReasons: refunds.map((r) => r.reason) });
      }

      const decision = decideGoodwill(percent, problem, { lastIssuedAt: last?.createdAt ?? null, hasPending: !!pending }, ctx.now);

      if (decision.decision === "queued_for_approval") {
        const [approval] = await tx
          .insert(s.approvals)
          .values({ kind: "goodwill_coupon", customerId: customer.id, orderNumber: orderId ?? null, payload: { percent, reason }, reason: decision.why, createdAt: ctx.now })
          .returning();
        return ok(
          {
            status: "pending_approval",
            approvalId: approval!.id,
            message: `No coupon has been issued yet. A ${percent}% goodwill coupon request was sent to a team member for approval.`,
          },
          "queued_for_approval",
        );
      }

      // Deterministic code (customer + store date): the same conversation
      // replayed against a fresh seed produces the same tool output (M2 cache).
      const code = `SORRY-${customer.id}-${ctx.now.toISOString().slice(0, 10).replaceAll("-", "")}`;
      const expiresAt = addDays(ctx.now, RULES.goodwillExpiryDays);
      await tx.insert(s.coupons).values({
        code,
        kind: "percent",
        value: percent,
        singleUse: true,
        source: "goodwill",
        customerId: customer.id,
        createdAt: ctx.now,
        expiresAt,
      });
      return ok(
        { status: "issued", code, percentOff: percent, expires: day(expiresAt), terms: "Single use, only for this customer's account." },
        "auto_approved",
      );
    });
  },
});

export const escalateToHuman = defineTool({
  name: "escalate_to_human",
  description: "Hand the conversation to a human support agent, with a short reason. Use when a request is outside what you can do.",
  agents: ["support"],
  args: z.object({ reason: z.string().min(3).max(500), orderId: orderNumberArg.optional() }),
  async run(ctx, { reason, orderId }) {
    // Only attach the order if it's the customer's own; never error on escalation.
    let orderNumber: number | null = null;
    if (orderId !== undefined) {
      const owned = await loadOwnedOrder(ctx, orderId);
      if (owned.ok) orderNumber = owned.data.number;
    }
    const [row] = await ctx.db
      .insert(s.escalations)
      .values({ customerId: ctx.session.customerId, orderNumber, reason, createdAt: ctx.now })
      .returning();
    return ok({
      ticket: `ESC-${row!.id}`,
      message: "A human support agent will follow up by email, usually within one business day.",
    });
  },
});

export const SUPPORT_TOOLS = [
  findCustomer,
  getOrder,
  getTracking,
  checkReturnEligibilityTool,
  issueRefund,
  issueGoodwillCoupon,
  escalateToHuman,
];
