import { eq } from "drizzle-orm";
import { approve, reject } from "../approvals/decide.ts";
import type { DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { callTool } from "../tools/define.ts";
import { getTool } from "../tools/registry.ts";

/**
 * Example approvals for the public site's Approvals page (Julian, 2026-10-05):
 * a few pending and decided requests so visitors can see the workflow. They're
 * made the way real ones are, by calling the real tools as the customer and
 * deciding with the real approve/reject code, so they show exactly what the
 * rules produce.
 *
 * Never part of the eval/test seed: seed() doesn't call this. Every customer
 * and order here appears in no eval case (a test checks that), so the
 * examples can't change an eval result. The public export adds them inside a
 * transaction that is rolled back, so the dev database isn't changed either.
 * The agent notes and decision notes are written by hand, as an agent and a
 * reviewer would write them, and the page marks every one as an example.
 */
type Request =
  | { tool: "issue_refund"; args: { orderId: number; amount: number; reason: "lost" | "damaged"; item?: string; cause?: "arrived_damaged"; note: string } }
  | { tool: "issue_goodwill_coupon"; args: { orderId: number; percent: number; reason: string } };

export type DemoApproval = {
  customer: string;
  request: Request;
  decision?: { action: "approve" | "reject"; note: string; hoursLater: number };
};

export const DEMO_APPROVALS: DemoApproval[] = [
  {
    customer: "mateo.novak34@example.com",
    request: {
      tool: "issue_refund",
      args: { orderId: 1062, amount: 457, reason: "lost", note: "The carrier marked order #1062 lost in transit. The customer asked for a full refund of the softshell, the rain jacket and the boots." },
    },
    decision: { action: "approve", note: "Tracking confirms the loss. Approved in full: $457.00, what was paid.", hoursLater: 3 },
  },
  {
    customer: "ines.rossi25@example.com",
    request: {
      tool: "issue_goodwill_coupon",
      args: { orderId: 1004, percent: 20, reason: "Order #1004 is delayed and the customer needs the jacket for a trip this weekend. They asked for 20% off their next order." },
    },
    decision: { action: "reject", note: "20% is above our 10% goodwill limit for a delay. A 10% coupon is the most we offer; the agent can give that right away.", hoursLater: 4 },
  },
  {
    customer: "omar.costa170@example.com",
    request: {
      tool: "issue_refund",
      args: { orderId: 1040, amount: 518, reason: "lost", note: "Order #1040 (two Traverse 65 packs) was marked lost in transit. The customer asked for a full refund." },
    },
  },
  {
    customer: "leo.kowalski32@example.com",
    request: {
      tool: "issue_refund",
      args: {
        orderId: 1093,
        amount: 349,
        reason: "damaged",
        item: "bag-ember-minus10",
        cause: "arrived_damaged",
        note: "The Ember -10°C sleeping bag arrived with a torn baffle and down coming out. Reported 8 days after delivery, with photos offered.",
      },
    },
  },
  {
    customer: "clara.fischer153@example.com",
    request: {
      tool: "issue_goodwill_coupon",
      args: { orderId: 1015, percent: 15, reason: "Order #1015 was lost in transit. The customer asked for 15% off a replacement order for the trouble." },
    },
  },
];

/**
 * Adds the examples, in order, and returns their approval ids. `now` is the
 * store's "today" (as the tools see it); decisions are made `hoursLater` after it.
 */
export async function seedDemoApprovals(db: DbOrTx, now: Date): Promise<number[]> {
  const ids: number[] = [];
  for (const example of DEMO_APPROVALS) {
    const [customer] = await db.select({ id: s.customers.id }).from(s.customers).where(eq(s.customers.email, example.customer));
    if (!customer) throw new Error(`Demo approvals: no customer ${example.customer}`);
    const tool = getTool(example.request.tool)!;
    const args = example.request.tool === "issue_goodwill_coupon" ? { customer: example.customer, ...example.request.args } : example.request.args;
    const result = await callTool(tool, { db, now, session: { customerId: customer.id } }, args);
    const data = result.ok ? (result.data as { status?: string; approvalId?: number }) : null;
    if (!data || data.status !== "pending_approval" || typeof data.approvalId !== "number") {
      throw new Error(`Demo approvals: ${example.customer}'s ${example.request.tool} wasn't queued for approval: ${JSON.stringify(result)}`);
    }
    ids.push(data.approvalId);
    if (example.decision) {
      const ctx = { db, storeNow: now, decidedAt: new Date(now.getTime() + example.decision.hoursLater * 3_600_000), decidedBy: "admin" };
      const decided = await (example.decision.action === "approve" ? approve : reject)(ctx, data.approvalId, example.decision.note);
      if (!decided.ok) throw new Error(`Demo approvals: couldn't ${example.decision.action} ${example.customer}'s request: ${decided.error.message}`);
    }
  }
  return ids;
}
