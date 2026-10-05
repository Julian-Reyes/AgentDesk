import { describe, expect, it } from "vitest";
import { listApprovals } from "../../src/approvals/list.ts";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { DEMO_APPROVALS, seedDemoApprovals } from "../../src/seed/demo-approvals.ts";
import { TEST_NOW, inTx } from "../helpers.ts";

describe("the public site's example approvals", () => {
  it("are made by the real tools and decisions: 3 pending, 1 approved, 1 rejected, each queued for the rules' reason", () =>
    inTx(async (tx) => {
      const ids = await seedDemoApprovals(tx, TEST_NOW);
      const views = (await listApprovals(tx)).filter((a) => ids.includes(a.id));
      expect(views.map((a) => a.status).sort()).toEqual(["approved", "pending", "pending", "pending", "rejected"]);
      const byOrder = Object.fromEntries(views.map((a) => [a.orderNumber, a]));
      expect(byOrder[1062]).toMatchObject({ kind: "refund", amountCents: 45700, status: "approved", decidedBy: "admin", decisionNote: expect.stringMatching(/^Tracking confirms/) });
      expect(byOrder[1004]).toMatchObject({ kind: "goodwill_coupon", percent: 20, status: "rejected", queuedBecause: expect.stringMatching(/10%/) });
      expect(byOrder[1093]).toMatchObject({ kind: "refund", item: expect.stringMatching(/Ember/), queuedBecause: expect.stringMatching(/\$349\.00, above the \$50\.00 automatic limit/) });
      expect(views.every((a) => a.runId === null && a.agentNote)).toBe(true);
    }));

  it("use customers and orders no eval case mentions, so they can't change an eval result", () => {
    const cases = JSON.stringify(ALL_CASES);
    for (const d of DEMO_APPROVALS) {
      expect(cases, d.customer).not.toContain(d.customer);
      expect(cases, String(d.request.args.orderId)).not.toMatch(new RegExp(`\\b${d.request.args.orderId}\\b`));
    }
  });
});
