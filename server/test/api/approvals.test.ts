import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AppDeps } from "../../src/api/app.ts";
import { draftFileName } from "../../src/approvals/drafts.ts";
import type { Tx } from "../../src/db/client.ts";
import * as s from "../../src/db/schema.ts";
import { PRIYA, SOFIA, as, call, inTx } from "../helpers.ts";
import { TOKEN, json, testApp } from "./helpers.ts";

const appFor = (tx: Tx, over: Partial<AppDeps> = {}) => testApp(tx, { over }).app;
const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const post = (path: string, body: unknown, headers: Record<string, string> = auth) => ({ method: "POST", headers, body: JSON.stringify(body) });

async function queueBag(tx: Tx) {
  const r = (await call(tx, "issue_refund", { orderId: 1051, amount: 179.99, reason: "damaged", cause: "arrived_damaged", item: "bag-harbor-double" }, as(PRIYA))) as any;
  return r.data.approvalId as number;
}

describe("GET /api/approvals", () => {
  it("lists the queue with what a reviewer needs, and no emails", () =>
    inTx(async (tx) => {
      const id = await queueBag(tx);
      await call(tx, "issue_goodwill_coupon", { customer: "sofia.alvarez@example.com", orderId: 1055, percent: 20, reason: "Late twice" }, as(SOFIA));
      const res = await appFor(tx).request("/api/approvals?status=pending");
      expect(res.status).toBe(200);
      const { data } = await json(res);
      expect(data.approvals).toHaveLength(2);
      expect(data.approvals[0]).toMatchObject({
        id,
        kind: "refund",
        status: "pending",
        customer: { id: PRIYA, name: "Priya Raman" },
        orderNumber: 1051,
        amountCents: 17999,
        percent: null,
        item: "Harbor 3°C Double Sleeping Bag",
        refundReason: "damaged",
        queuedBecause: expect.stringContaining("above the $50.00 automatic limit"),
        runId: null,
        draftCase: null,
      });
      expect(data.approvals[1]).toMatchObject({ kind: "goodwill_coupon", percent: 20, amountCents: null, agentNote: "Late twice" });
      expect(JSON.stringify(data)).not.toContain("@example.com");
    }));

  it("filters by status and refuses an unknown one", () =>
    inTx(async (tx) => {
      await queueBag(tx);
      expect((await json(await appFor(tx).request("/api/approvals?status=approved"))).data.approvals).toEqual([]);
      const bad = await appFor(tx).request("/api/approvals?status=maybe");
      expect(bad.status).toBe(400);
      expect((await json(bad)).error.code).toBe("INVALID_QUERY");
    }));

  it("says whether a rejection's draft case has been written", () =>
    inTx(async (tx) => {
      const draftsDir = mkdtempSync(join(tmpdir(), "drafts-"));
      const id = await queueBag(tx);
      await tx.update(s.approvals).set({ runId: "0123456789abcdef" }).where(eq(s.approvals.id, id));
      const app = appFor(tx, { draftsDir });
      await app.request(`/api/admin/approvals/${id}/reject`, post("", { note: "Not damaged in the photo." }));
      const status = async () => (await json(await app.request("/api/approvals?status=rejected"))).data.approvals[0].draftCase;
      expect(await status()).toBe("not_yet");
      writeFileSync(join(draftsDir, draftFileName({ id, runId: "0123456789abcdef" })), "// draft");
      expect(await status()).toBe("written");
    }));
});

describe("POST /api/admin/approvals/:id/approve|reject", () => {
  it("needs the admin token: nothing is decided without it", () =>
    inTx(async (tx) => {
      const id = await queueBag(tx);
      const app = appFor(tx);
      for (const action of ["approve", "reject"]) {
        const none = await app.request(`/api/admin/approvals/${id}/${action}`, post("", { note: "ok then" }, { "content-type": "application/json" }));
        expect(none.status).toBe(401);
        const wrong = await app.request(`/api/admin/approvals/${id}/${action}`, post("", { note: "ok then" }, { ...auth, authorization: `Bearer ${"x".repeat(30)}` }));
        expect(wrong.status).toBe(401);
      }
      const noToken = await appFor(tx, { adminToken: undefined }).request(`/api/admin/approvals/${id}/approve`, post("", {}));
      expect(noToken.status).toBe(403);
      const [row] = await tx.select().from(s.approvals).where(eq(s.approvals.id, id));
      expect(row!.status).toBe("pending");
    }));

  it("approves with the token, stamping the wall-clock time", () =>
    inTx(async (tx) => {
      const id = await queueBag(tx);
      const res = await appFor(tx).request(`/api/admin/approvals/${id}/approve`, post("", { note: "Fine" }));
      expect(res.status).toBe(200);
      expect(await json(res)).toMatchObject({ ok: true, data: { status: "approved", amountCents: 17999 } });
      const [row] = await tx.select().from(s.approvals).where(eq(s.approvals.id, id));
      expect(row).toMatchObject({ decidedBy: "admin", decidedAt: new Date("2026-10-02T12:00:00Z") });
    }));

  it("maps business outcomes to statuses: note required 400, decided twice 409, unknown 404", () =>
    inTx(async (tx) => {
      const id = await queueBag(tx);
      const app = appFor(tx);
      const noNote = await app.request(`/api/admin/approvals/${id}/reject`, post("", {}));
      expect([noNote.status, (await json(noNote)).error.code]).toEqual([400, "NOTE_REQUIRED"]);
      // An empty body counts as no note, not a crash.
      const empty = await app.request(`/api/admin/approvals/${id}/reject`, { method: "POST", headers: { authorization: auth.authorization } });
      expect((await json(empty)).error.code).toBe("NOTE_REQUIRED");
      expect((await app.request(`/api/admin/approvals/${id}/reject`, post("", { note: "Duplicate request" }))).status).toBe(200);
      const again = await app.request(`/api/admin/approvals/${id}/approve`, post("", {}));
      expect([again.status, (await json(again)).error.code]).toEqual([409, "ALREADY_DECIDED"]);
      expect((await app.request(`/api/admin/approvals/99999/approve`, post("", {}))).status).toBe(404);
      expect((await app.request(`/api/admin/approvals/abc/approve`, post("", {}))).status).toBe(404);
      expect((await app.request(`/api/admin/approvals/${id}/approve`, post("", { note: 5 }))).status).toBe(400);
    }));
});
