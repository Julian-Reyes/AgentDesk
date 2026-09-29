import { describe, expect, it } from "vitest";
import { Conversation } from "../../src/agents/conversation.ts";
import { buildTeam, loadTeamSpec } from "../../src/agents/team.ts";
import { fixedClock } from "../../src/domain/clock.ts";
import { FakeProvider, fake } from "../../src/llm/fake.ts";
import { ProviderError } from "../../src/llm/openai-compatible.ts";
import { MemoryTracer } from "../../src/tracing/tracer.ts";
import { emptyHealth, toolCallHealth } from "../../src/tracing/tool-call-health.ts";
import { MAYA, inTx } from "../helpers.ts";

const garbled = { status: 400, code: "tool_use_failed", message: "attempted to call tool 'hand-off'" };

describe("toolCallHealth: garbled and rejected tool calls, per model", () => {
  it("counts every kind of problem from a real loop trace, charged to the model that made it", () =>
    inTx(async (tx) => {
      const router = new FakeProvider([
        fake.text("support I think"), // invalid router output, then a valid retry
        fake.json({ route: "shopping", category: "stock", urgency: "low", confidence: 0.9 }),
      ]);
      const agent = new FakeProvider([
        // A call the provider rejected once before it succeeded (the retry hid it from the customer).
        { ...fake.tools(["search_products", { query: "tent" }]), failedAttempts: [garbled] },
        // Wrong agent's tool, a made-up tool, broken JSON, and a garbled handoff.
        fake.tools(["get_order", { orderId: 1042 }], ["hand-off", {}], ["check_stock", "{oops"], ["handoff", { to: "billing", reason: "x" }]),
        // Plain text that is the reply tool's JSON.
        fake.text('{"message":"We have tents!"}'),
      ]);
      const tracer = new MemoryTracer();
      const team = buildTeam(loadTeamSpec({ MODEL: "fake" }), { fakes: { router, shopping: agent, support: agent }, env: {} });
      const convo = await Conversation.start({
        db: tx, clock: fixedClock("2026-09-15"), session: { customerId: MAYA }, customer: { name: "Maya Chen", email: "maya.chen@example.com" },
        router: team.router, agents: team.agents, tracer, source: "test", team: team.meta,
      });
      await convo.send("tents?");

      expect(toolCallHealth(tracer.runs[0]!.steps)).toEqual({
        fake: {
          modelCalls: 5, // 2 router + 3 agent
          rejectedByProvider: 1,
          invalidArgs: 2, // broken JSON for check_stock + handoff to a nonexistent agent
          unknownTool: 2, // get_order (support's tool) + "hand-off"
          invalidRouterOutput: 1,
          implicitReplies: 1,
          unwrappedReplies: 1,
        },
      });
    }));

  it("a model call where every attempt failed is still counted, against the right model", () =>
    inTx(async (tx) => {
      const router = new FakeProvider([fake.json({ route: "support", category: "order_status", urgency: "normal", confidence: 0.9 })]);
      const err = Object.assign(new ProviderError("groq: HTTP 400", 400), { failedAttempts: [garbled, garbled, garbled, garbled] });
      const agent = new FakeProvider([err]);
      const tracer = new MemoryTracer();
      const team = buildTeam(loadTeamSpec({ MODEL: "fake" }), { fakes: { router, shopping: agent, support: agent }, env: {} });
      const convo = await Conversation.start({
        db: tx, clock: fixedClock("2026-09-15"), session: { customerId: MAYA }, customer: null,
        router: team.router, agents: team.agents, tracer, source: "test", team: team.meta,
      });
      const r = await convo.send("where's 1042?");
      expect(r.outcome).toBe("failed");
      expect(tracer.runs[0]!.steps.at(-1)).toMatchObject({ kind: "error", modelConfigId: "fake", data: { failedAttempts: [garbled, garbled, garbled, garbled] } });
      expect(toolCallHealth(tracer.runs[0]!.steps).fake).toMatchObject({ modelCalls: 2, rejectedByProvider: 4 });
    }));

  it("keeps models apart", () => {
    const health = toolCallHealth([
      { kind: "router", modelConfigId: "gemini/gemini-3.5-flash-lite", data: {} },
      { kind: "model_call", modelConfigId: "groq/gpt-oss-120b", data: { failedAttempts: [garbled, { message: "network error" }] } },
      { kind: "tool_call", data: { result: { ok: false, error: { code: "UNKNOWN_TOOL" } } } },
      { kind: "reply", data: { implicit: true } },
    ]);
    expect(health["gemini/gemini-3.5-flash-lite"]).toEqual({ ...emptyHealth(), modelCalls: 1 });
    // Only model-output rejections count, not network errors.
    expect(health["groq/gpt-oss-120b"]).toEqual({ ...emptyHealth(), modelCalls: 1, rejectedByProvider: 1, unknownTool: 1, implicitReplies: 1 });
  });
});
