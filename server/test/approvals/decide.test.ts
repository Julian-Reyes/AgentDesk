import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { Conversation } from "../../src/agents/conversation.ts";
import { buildTeam, loadTeamSpec } from "../../src/agents/team.ts";
import { approve, reject, type DecisionContext } from "../../src/approvals/decide.ts";
import { customerMessages, draftFileName, renderDraft, rejectedWithRun } from "../../src/approvals/drafts.ts";
import type { Tx } from "../../src/db/client.ts";
import * as s from "../../src/db/schema.ts";
import { fixedClock } from "../../src/domain/clock.ts";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { FakeProvider, fake } from "../../src/llm/fake.ts";
import { callTool } from "../../src/tools/define.ts";
import { getTool } from "../../src/tools/registry.ts";
import { DbTracer } from "../../src/tracing/tracer.ts";
import { MAYA, PRIYA, SOFIA, TOM, TEST_NOW, as, call, db, inTx } from "../helpers.ts";

const DECIDED_AT = new Date("2026-10-02T15:30:00Z");
const ctxFor = (tx: Tx): DecisionContext => ({ db: tx, storeNow: TEST_NOW, decidedAt: DECIDED_AT, decidedBy: "admin" });

/** Priya's $179.99 damaged sleeping bag on #1051: always queued (the item costs more than $50). */
async function queueBagRefund(tx: Tx, amount = 179.99) {
  const r = (await call(tx, "issue_refund", { orderId: 1051, amount, reason: "damaged", item: "bag-harbor-double" }, as(PRIYA))) as any;
  expect(r.data.status).toBe("pending_approval");
  return r.data.approvalId as number;
}

const approvalRow = async (tx: Tx, id: number) => (await tx.select().from(s.approvals).where(eq(s.approvals.id, id)))[0]!;
const refundFor = async (tx: Tx, approvalId: number) => (await tx.select().from(s.refunds).where(eq(s.refunds.approvalId, approvalId)))[0]!;

describe("approving a refund", () => {
  it("issues exactly the queued $179.99 and records the decision", () =>
    inTx(async (tx) => {
      const id = await queueBagRefund(tx);
      const r = (await approve(ctxFor(tx), id, "  Photo checks out.  ")) as any;
      expect(r).toMatchObject({ ok: true, data: { status: "approved", amountCents: 17999 } });
      expect(await refundFor(tx, id)).toMatchObject({ status: "issued", amountCents: 17999, orderNumber: 1051 });
      expect(await approvalRow(tx, id)).toMatchObject({ status: "approved", decidedBy: "admin", decidedAt: DECIDED_AT, decisionNote: "Photo checks out." });
    }));

  it("refuses when another refund on the item since then would take it above what was paid, and leaves it pending", () =>
    inTx(async (tx) => {
      const id = await queueBagRefund(tx);
      const refund = await refundFor(tx, id);
      // e.g. a teammate refunded $20 for the same item by another route meanwhile
      await tx.insert(s.refunds).values({ orderNumber: 1051, amountCents: 2000, reason: "damaged", status: "issued", orderItemId: refund.orderItemId, createdAt: TEST_NOW });
      const r = (await approve(ctxFor(tx), id)) as any;
      expect(r).toMatchObject({ ok: false, error: { code: "OVER_REFUNDABLE", details: { amountCents: 17999, maxRefundableCents: 15999 } } });
      expect((await refundFor(tx, id)).status).toBe("pending_approval");
      expect((await approvalRow(tx, id)).status).toBe("pending");
    }));

  it("checks the whole order too, not just the item (a lost order, refunded elsewhere meanwhile)", () =>
    inTx(async (tx) => {
      const r1 = (await call(tx, "issue_refund", { orderId: 1054, amount: 199, reason: "lost" }, as(TOM))) as any;
      expect(r1.data.status).toBe("pending_approval");
      await tx.insert(s.refunds).values({ orderNumber: 1054, amountCents: 1, reason: "lost", status: "issued", createdAt: TEST_NOW });
      expect(await approve(ctxFor(tx), r1.data.approvalId)).toMatchObject({ ok: false, error: { code: "OVER_REFUNDABLE" } });
    }));

  it("a partial amount still fits next to a smaller refund", () =>
    inTx(async (tx) => {
      const id = await queueBagRefund(tx, 100);
      const refund = await refundFor(tx, id);
      await tx.insert(s.refunds).values({ orderNumber: 1051, amountCents: 7999, reason: "damaged", status: "issued", orderItemId: refund.orderItemId, createdAt: TEST_NOW });
      expect(await approve(ctxFor(tx), id)).toMatchObject({ ok: true }); // 79.99 + 100 = 179.99, exactly what was paid
    }));
});

describe("approving goodwill", () => {
  it("creates one single-use coupon for that customer only, at the requested percent", () =>
    inTx(async (tx) => {
      // Sofia had a coupon 10 days ago and asks for 20%: queued twice over.
      const q = (await call(tx, "issue_goodwill_coupon", { customer: "sofia.alvarez@example.com", orderId: 1055, percent: 20, reason: "Late again" }, as(SOFIA))) as any;
      expect(q.data.status).toBe("pending_approval");
      const r = (await approve(ctxFor(tx), q.data.approvalId)) as any;
      const code = `GOODWILL-${q.data.approvalId}`;
      expect(r).toMatchObject({ ok: true, data: { code, percent: 20, expiresAt: "2026-12-14" } });
      const coupons = await tx.select().from(s.coupons).where(eq(s.coupons.code, code));
      expect(coupons).toEqual([expect.objectContaining({ kind: "percent", value: 20, singleUse: true, source: "goodwill", customerId: SOFIA, createdAt: TEST_NOW })]);
      // Usable by Sofia, by nobody else.
      const cart = [{ productId: "lamp-glowworm-300", qty: 1 }];
      expect(await call(tx, "validate_coupon", { code, cart }, as(SOFIA))).toMatchObject({ ok: true, data: { valid: true } });
      expect(await call(tx, "validate_coupon", { code, cart }, as(MAYA))).not.toMatchObject({ data: { valid: true } });
    }));
});

describe("rejecting", () => {
  it("needs a note, and issues nothing", () =>
    inTx(async (tx) => {
      const id = await queueBagRefund(tx);
      for (const note of [undefined, "", "   ", "no"]) {
        expect(await reject(ctxFor(tx), id, note)).toMatchObject({ ok: false, error: { code: "NOTE_REQUIRED" } });
      }
      expect(await reject(ctxFor(tx), id, "x".repeat(1001))).toMatchObject({ ok: false, error: { code: "NOTE_TOO_LONG" } });
      expect((await approvalRow(tx, id)).status).toBe("pending");

      expect(await reject(ctxFor(tx), id, "No photo of the damage.")).toMatchObject({ ok: true, data: { status: "rejected" } });
      expect((await refundFor(tx, id)).status).toBe("rejected");
      expect(await approvalRow(tx, id)).toMatchObject({ status: "rejected", decisionNote: "No photo of the damage.", decidedAt: DECIDED_AT });
      const rows = await tx.select().from(s.refunds).where(eq(s.refunds.orderNumber, 1051));
      expect(rows.some((x) => x.status === "issued")).toBe(false);
    }));

  it("a rejected goodwill request creates no coupon", () =>
    inTx(async (tx) => {
      const q = (await call(tx, "issue_goodwill_coupon", { customer: "sofia.alvarez@example.com", orderId: 1055, percent: 20, reason: "Late again" }, as(SOFIA))) as any;
      await reject(ctxFor(tx), q.data.approvalId, "She already had one this month.");
      expect(await tx.select().from(s.coupons).where(eq(s.coupons.code, `GOODWILL-${q.data.approvalId}`))).toHaveLength(0);
    }));
});

describe("deciding twice, or nothing", () => {
  it("a decided approval can't be decided again, either way", () =>
    inTx(async (tx) => {
      const a = await queueBagRefund(tx);
      await approve(ctxFor(tx), a);
      expect(await approve(ctxFor(tx), a)).toMatchObject({ ok: false, error: { code: "ALREADY_DECIDED" } });
      expect(await reject(ctxFor(tx), a, "Changed my mind")).toMatchObject({ ok: false, error: { code: "ALREADY_DECIDED" } });
      expect(await refundFor(tx, a)).toMatchObject({ status: "issued" });
    }));

  it("unknown approval", () =>
    inTx(async (tx) => {
      expect(await approve(ctxFor(tx), 99999)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }));
});

describe("approvals link to their conversation", () => {
  it("both tools store the run id they're given", () =>
    inTx(async (tx) => {
      const ctx = (customerId: number) => ({ db: tx, now: TEST_NOW, session: { customerId }, runId: "run-abc" });
      const r = (await callTool(getTool("issue_refund")!, ctx(PRIYA), { orderId: 1051, amount: 179.99, reason: "damaged", item: "bag-harbor-double" })) as any;
      const g = (await callTool(getTool("issue_goodwill_coupon")!, ctx(SOFIA), { customer: "sofia.alvarez@example.com", percent: 20, reason: "Sorry" })) as any;
      expect((await approvalRow(tx, r.data.approvalId)).runId).toBe("run-abc");
      expect((await approvalRow(tx, g.data.approvalId)).runId).toBe("run-abc");
      // Outside a conversation (CLI) there is none.
      const plain = (await call(tx, "issue_refund", { orderId: 1054, amount: 199, reason: "lost" }, as(TOM))) as any;
      expect((await approvalRow(tx, plain.data.approvalId)).runId).toBeNull();
    }));
});

describe("rejections become draft cases", () => {
  const created: string[] = [];
  afterEach(async () => {
    for (const id of created.splice(0)) await db.delete(s.runs).where(eq(s.runs.id, id));
  });

  it("a conversation's rejected refund becomes a draft with the customer's messages and the note, outside ALL_CASES", () =>
    inTx(async (tx) => {
      const router = new FakeProvider([fake.json({ route: "support", category: "refunds", urgency: "high", confidence: 0.9 })]);
      const agent = new FakeProvider([
        fake.reply("Which item is damaged?"),
        fake.tools(["issue_refund", { orderId: 1051, amount: 179.99, reason: "damaged", item: "sleeping bag" }]),
        fake.reply("Sent for approval."),
      ]);
      const team = buildTeam(loadTeamSpec({ MODEL: "fake" }), { fakes: { router, shopping: agent, support: agent }, env: {} });
      const convo = await Conversation.start({
        db: tx,
        clock: fixedClock("2026-09-15"),
        session: { customerId: PRIYA },
        customer: { name: "Priya Raman", email: "priya.raman@example.com" },
        router: team.router,
        agents: team.agents,
        tracer: new DbTracer(db), // traces on their own connection, as in the server
        source: "test",
        team: team.meta,
      });
      created.push(convo.runId);
      await convo.send("My order #1051 arrived damaged.");
      await convo.send('The "Harbor" bag — zipper torn off.\nPlease refund it.');

      const [approval] = await tx.select().from(s.approvals).where(eq(s.approvals.orderNumber, 1051));
      expect(approval!.runId).toBe(convo.runId);
      await reject(ctxFor(tx), approval!.id, "Customer already got a replacement by phone.");

      const [rejected] = await rejectedWithRun(tx);
      expect(rejected!.approval.id).toBe(approval!.id);
      const messages = await customerMessages(db, convo.runId);
      expect(messages).toEqual(["My order #1051 arrived damaged.", 'The "Harbor" bag — zipper torn off.\nPlease refund it.']);

      // The draft is a loadable module (quotes and newlines escaped) and is not a case anyone runs.
      const dir = mkdtempSync(join(tmpdir(), "drafts-"));
      const file = join(dir, draftFileName(rejected!.approval));
      writeFileSync(file, renderDraft(rejected!, messages));
      const { draft } = await import(file);
      expect(draft).toMatchObject({
        customer: "priya.raman@example.com",
        turns: [{ customer: messages[0] }, { customer: messages[1], assumes: expect.stringContaining("TODO") }],
        expect: expect.stringContaining("TODO"),
      });
      expect(draft.why).toContain("Customer already got a replacement by phone.");
      expect(draft.why).toContain("$179.99 damaged refund on #1051");
      expect(ALL_CASES.some((c) => c.id === draft.id || c.source === draft.source)).toBe(false);
    }));

  it("only rejected approvals from a conversation qualify", () =>
    inTx(async (tx) => {
      const id = await queueBagRefund(tx); // no run id (CLI)
      await reject(ctxFor(tx), id, "Not from a chat.");
      expect(await rejectedWithRun(tx)).toEqual([]);
    }));
});
