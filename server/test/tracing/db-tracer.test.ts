import { asc, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { Conversation } from "../../src/agents/conversation.ts";
import { buildTeam, loadTeamSpec } from "../../src/agents/team.ts";
import * as s from "../../src/db/schema.ts";
import { fixedClock } from "../../src/domain/clock.ts";
import { FakeProvider, fake } from "../../src/llm/fake.ts";
import { DbTracer } from "../../src/tracing/tracer.ts";
import { MAYA, PRIYA, db, inTx } from "../helpers.ts";

const created: string[] = [];
afterEach(async () => {
  for (const id of created.splice(0)) await db.delete(s.runs).where(eq(s.runs.id, id));
});

const wall = () => new Date("2026-09-29T10:00:00Z");

describe("DbTracer", () => {
  it("stores the run, its steps in order, and running token/cost totals", async () => {
    const trace = await new DbTracer(db, wall).startRun({ source: "test", customerId: MAYA, team: { router: { model: "fake" } }, labels: { case: "t1" } });
    created.push(trace.id);
    await trace.step({ turn: 1, kind: "user_message", data: { text: "hi" } });
    await trace.step({ turn: 1, kind: "model_call", agent: "support", modelConfigId: "fake", provider: "fake", promptVersion: "support@1#abc", data: {}, inputTokens: 120, outputTokens: 30, latencyMs: 400, cached: false, costMicros: 7 });
    await trace.step({ turn: 1, kind: "tool_call", agent: "support", data: { name: "issue_refund" }, policyDecision: "queued_for_approval" });
    await trace.step({ turn: 1, kind: "model_call", agent: "support", data: {}, inputTokens: 200, outputTokens: 10, costMicros: 3 });
    await trace.finish({ outcome: "approval_needed", turns: 1 });

    const [run] = await db.select().from(s.runs).where(eq(s.runs.id, trace.id));
    expect(run).toMatchObject({ source: "test", customerId: MAYA, outcome: "approval_needed", turns: 1, inputTokens: 320, outputTokens: 40, costMicros: 10, labels: { case: "t1" } });
    expect(run!.endedAt).toEqual(wall());
    const steps = await db.select().from(s.runSteps).where(eq(s.runSteps.runId, trace.id)).orderBy(asc(s.runSteps.seq));
    expect(steps.map((x) => [x.seq, x.kind])).toEqual([[1, "user_message"], [2, "model_call"], [3, "tool_call"], [4, "model_call"]]);
    expect(steps[1]).toMatchObject({ modelConfigId: "fake", provider: "fake", promptVersion: "support@1#abc", latencyMs: 400, cached: false });
    expect(steps[2]!.policyDecision).toBe("queued_for_approval");
  });

  it("the trace survives when the tools' transaction is rolled back (as in eval runs)", async () => {
    let runId = "";
    await inTx(async (tx) => {
      const router = new FakeProvider([fake.json({ route: "support", category: "refunds", urgency: "high", confidence: 0.9 })]);
      const agent = new FakeProvider([fake.tools(["issue_refund", { orderId: 1051, amount: 179.99, reason: "damaged", item: "sleeping bag" }]), fake.reply("Sent for approval.")]);
      const team = buildTeam(loadTeamSpec({ MODEL: "fake" }), { fakes: { router, shopping: agent, support: agent }, env: {} });
      const convo = await Conversation.start({
        db: tx,
        clock: fixedClock("2026-09-15"),
        session: { customerId: PRIYA },
        customer: { name: "Priya Raman", email: "priya.raman@example.com" },
        router: team.router,
        agents: team.agents,
        tracer: new DbTracer(db, wall), // its own connection, not tx
        source: "test",
        team: team.meta,
      });
      runId = convo.runId;
      created.push(runId);
      await convo.send("My bag from #1051 arrived torn.");
      // Inside the transaction, the approval exists...
      expect(await tx.select().from(s.approvals).where(eq(s.approvals.orderNumber, 1051))).toHaveLength(1);
    });
    // ...after rollback it's gone, but the trace is still there.
    expect(await db.select().from(s.approvals).where(eq(s.approvals.orderNumber, 1051))).toHaveLength(0);
    const [run] = await db.select().from(s.runs).where(eq(s.runs.id, runId));
    expect(run).toMatchObject({ outcome: "approval_needed", turns: 1 });
    expect(run!.team).toMatchObject({ support: { model: "fake", provider: "fake" } });
    const steps = await db.select().from(s.runSteps).where(eq(s.runSteps.runId, runId)).orderBy(asc(s.runSteps.seq));
    expect(steps.map((x) => x.kind)).toEqual(["user_message", "router", "model_call", "tool_call", "model_call", "tool_call", "reply"]);
  });
});
