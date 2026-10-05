import { describe, expect, it } from "vitest";
import { loadReplaysConfig, type ReplaysConfig } from "../../src/api/replays.ts";
import { inTx } from "../helpers.ts";
import { json, testApp } from "./helpers.ts";

const replay = (caseId: string) => ({ title: "t", run: "test-1", model: "gemini/gemini-3.5-flash-lite", caseId });

describe("GET /api/replays (the public site's chat recordings)", () => {
  it("serves every configured recording: each passed in its saved run", () =>
    inTx(async (tx) => {
      const config = loadReplaysConfig();
      const { data } = await json(await testApp(tx).app.request("/api/replays"));
      expect(data.replays.map((r: { caseId: string }) => r.caseId)).toEqual(config.replays.map((r) => r.caseId));
    }));

  it("each turn has the customer's message, the widget's progress labels and the saved reply; signed-in customers by name only", () =>
    inTx(async (tx) => {
      const config: ReplaysConfig = { replays: [replay("test-refund-over-limit-09"), replay("test-comparison-03")] };
      const { data } = await json(await testApp(tx, { over: { replays: { config: () => config } } }).app.request("/api/replays"));
      const [refund, comparison] = data.replays;
      expect(refund.turns).toHaveLength(2);
      expect(refund.turns[0]).toMatchObject({
        customer: expect.stringMatching(/^The zipper on the Squall Pro/),
        reply: expect.stringMatching(/\$229\.00 to a team member for approval/),
        progress: expect.arrayContaining(["Reviewing the refund request…"]),
      });
      expect(refund.customerName).toEqual(expect.any(String));
      expect(JSON.stringify(data)).not.toMatch(/@example\.com/);
      expect(comparison.customerName).toBeNull();
    }));

  it("drops a recording whose conversation failed or doesn't exist", () =>
    inTx(async (tx) => {
      const config: ReplaysConfig = { replays: [replay("test-adversarial-13"), replay("nope"), replay("test-comparison-03")] };
      const { data } = await json(await testApp(tx, { over: { replays: { config: () => config } } }).app.request("/api/replays"));
      expect(data.replays.map((r: { caseId: string }) => r.caseId)).toEqual(["test-comparison-03"]);
    }));
});
