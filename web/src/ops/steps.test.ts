import { describe, expect, it } from "vitest";
import type { TraceStep } from "../lib/api.ts";
import { byTurn, describeStep } from "./steps.ts";

const step = (kind: TraceStep["kind"], data: Record<string, unknown>, over: Partial<TraceStep> = {}): TraceStep => ({ turn: 1, kind, data, ...over });

describe("trace steps", () => {
  it("customer message and reply", () => {
    expect(describeStep(step("user_message", { text: "Where is #1042?" }))).toMatchObject({ tone: "customer", title: "Customer", body: "Where is #1042?" });
    expect(describeStep(step("reply", { message: "It shipped.", implicit: true }, { agent: "support" }))).toMatchObject({ title: "Reply (support)", body: "It shipped.", flags: ["sent as plain text, not with the reply tool"] });
  });

  it("router decision with confidence, and a fallback is flagged", () => {
    const v = describeStep(step("router", { attempt: 1, decision: { route: "support", category: "orders", urgency: "normal", confidence: 0.92 } }, { modelConfigId: "gemini/lite", latencyMs: 1834, inputTokens: 300, outputTokens: 20 }));
    expect(v).toMatchObject({ tone: "router", title: "Router → support", meta: ["confidence 92%", "orders · normal", "gemini/lite", "300 in / 20 out tokens", "1.8 s"], flags: [] });
    expect(describeStep(step("router", { attempt: 2, error: "not JSON", decision: { route: "clarify", category: "other", urgency: "normal", confidence: 0 }, fallback: true })).flags).toEqual([
      "invalid output: not JSON",
      "fell back to asking the customer to clarify",
    ]);
  });

  it("model call: which tools it asked for, tokens, latency, cached, failed attempts", () => {
    const v = describeStep(step("model_call", { message: { content: null, toolCalls: [{ name: "get_order" }, { name: "get_tracking" }] }, failedAttempts: [{}, {}] }, { agent: "support", modelConfigId: "groq/oss", latencyMs: 420, cached: true }));
    expect(v).toMatchObject({ title: "support model call → get_order, get_tracking", body: null, meta: ["groq/oss", "420 ms", "cached"], flags: ["2 failed attempts before this"] });
  });

  it("tool call: arguments, result and the rules' decision", () => {
    const queued = describeStep(step("tool_call", { name: "issue_refund", arguments: '{"orderId":1051,"amount":179.99}', result: { ok: true, data: {} } }, { policyDecision: "queued_for_approval" }));
    expect(queued).toMatchObject({ tone: "tool", title: "issue_refund (ok)", body: 'args {"orderId":1051,"amount":179.99}', flags: ["sent for approval"] });
    const denied = describeStep(step("tool_call", { name: "get_order", arguments: "{bad", result: { ok: false, error: { code: "NOT_YOUR_ORDER", message: "Not this customer's order." } } }, { policyDecision: "denied" }));
    expect(denied).toMatchObject({ tone: "warn", title: "get_order (NOT_YOUR_ORDER: Not this customer's order.)", body: 'args "{bad"', flags: ["denied by the rules"] });
  });

  it("handoff, held-back reply, error", () => {
    expect(describeStep(step("handoff", { arguments: '{"to":"support","reason":"order question"}', accepted: true }, { agent: "shopping" }))).toMatchObject({ title: "Handoff shopping → support", body: "order question" });
    expect(describeStep(step("reply_rejected", { message: "{{garbled", reason: "RAW_JSON", retry: true }))).toMatchObject({ tone: "warn", flags: ["RAW_JSON", "retried"] });
    expect(describeStep(step("error", { message: "step limit" }))).toMatchObject({ tone: "error", body: "step limit" });
  });

  it("groups steps by turn, in order", () => {
    const steps = [step("user_message", {}), step("reply", {}), step("user_message", {}, { turn: 2 })];
    expect(byTurn(steps).map((t) => [t.turn, t.steps.length])).toEqual([[1, 2], [2, 1]]);
  });
});
