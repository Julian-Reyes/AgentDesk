import { describe, expect, it } from "vitest";
import { roleStats } from "../../src/evals/runner/report.ts";

// Minimal saved conversations: an outcome and the trace steps roleStats reads.
const conv = (outcome: string, steps: object[]) => ({ record: { observation: { outcome, steps } } }) as any;
const router = (latencyMs: number) => ({ kind: "router", agent: "router", latencyMs, inputTokens: 400, outputTokens: 30, costMicros: 100, cached: false });
const call = (agent: string, latencyMs: number, cached = false) => ({ kind: "model_call", agent, latencyMs, inputTokens: 2000, outputTokens: 50, costMicros: 1000, cached });

describe("roleStats: a role's eval figures, counted like the live ones (Julian, 2026-10-06)", () => {
  const results = [
    conv("resolved", [router(500), call("shopping", 700), { kind: "tool_call", agent: "shopping" }, call("shopping", 900)]),
    conv("escalated", [router(600), call("support", 800)]),
    conv("failed", [router(400), call("shopping", 1500, true)]),
  ];

  it("counts the conversations the role took part in, their outcomes, and only the role's own calls", () => {
    expect(roleStats("shopping", results)).toEqual({
      conversations: 2,
      outcomes: { resolved: 1, approval_needed: 0, escalated: 0, failed: 1 },
      failureRate: 0.5,
      calls: 3,
      latencyMs: { p50: 900, p95: 1500 },
      inputTokens: 6000,
      outputTokens: 150,
      costMicros: 2000, // the cached call cost nothing
    });
  });

  it("the router takes part in every conversation", () => {
    expect(roleStats("router", results)).toMatchObject({ conversations: 3, calls: 3, outcomes: { resolved: 1, escalated: 1, failed: 1 } });
  });

  it("null when the role never ran", () => {
    expect(roleStats("support", [results[0]!])).toBeNull();
  });
});
