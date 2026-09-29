import { describe, expect, it } from "vitest";
import { ROUTER_PROMPT, promptId } from "../../src/agents/prompts.ts";
import { FALLBACK_DECISION, LlmRouter, extractJson } from "../../src/agents/router.ts";
import { getModelConfig } from "../../src/llm/config.ts";
import { FakeProvider, fake } from "../../src/llm/fake.ts";

const config = getModelConfig("fake", undefined, {});
const router = (p: FakeProvider) => new LlmRouter(p, config, promptId(ROUTER_PROMPT));
const customer = (text: string) => [{ role: "customer" as const, text }];

describe("LlmRouter", () => {
  it("returns the decision and asks the provider for JSON with the router prompt", async () => {
    const p = new FakeProvider([fake.json({ route: "support", category: "order_status", urgency: "normal", confidence: 0.92 })]);
    const r = await router(p).route(customer("Where's my order #1042?"));
    expect(r.decision).toEqual({ route: "support", category: "order_status", urgency: "normal", confidence: 0.92 });
    expect(r.fallback).toBe(false);
    expect(r.message).toBeUndefined();
    expect(p.requests[0]!.responseFormat).toBe("json");
    expect(p.requests[0]!.tools).toBeUndefined();
    expect(p.requests[0]!.messages[0]).toEqual({ role: "system", content: ROUTER_PROMPT.text });
    expect(p.requests[0]!.messages[1]).toEqual({ role: "user", content: "Where's my order #1042?" });
  });

  it("keeps the clarifying question for clarify, and drops a message on agent routes", async () => {
    const clarify = await router(new FakeProvider([fake.json({ route: "clarify", category: "other", urgency: "low", confidence: 0.4, message: "Before or after buying?" })])).route(customer("help"));
    expect(clarify.message).toBe("Before or after buying?");
    const shopping = await router(new FakeProvider([fake.json({ route: "shopping", category: "stock", urgency: "low", confidence: 0.9, message: "stray" })])).route(customer("jacket in M?"));
    expect(shopping.message).toBeUndefined();
  });

  it("tolerates code fences and text around the JSON; unknown category becomes other; bad urgency becomes normal", async () => {
    const p = new FakeProvider([fake.text('Sure!\n```json\n{"route":"shopping","category":"tents","urgency":"asap","confidence":"0.8"}\n```')]);
    const r = await router(p).route(customer("tents?"));
    expect(r.decision).toEqual({ route: "shopping", category: "other", urgency: "normal", confidence: 0.8 });
  });

  it("retries once with the validation error, then succeeds", async () => {
    const p = new FakeProvider([fake.text("I think support"), fake.json({ route: "support", category: "refunds", urgency: "high", confidence: 0.7 })]);
    const r = await router(p).route(customer("refund me"));
    expect(r.decision.route).toBe("support");
    expect(r.calls).toHaveLength(2);
    expect(r.calls[0]!.error).toMatch(/no JSON/);
    const retry = p.requests[1]!.messages;
    expect(retry.at(-1)).toMatchObject({ role: "user", content: expect.stringMatching(/not valid/) });
  });

  it("falls back to clarify (never a guess) when both attempts are unusable", async () => {
    const p = new FakeProvider([fake.json({ route: "billing" }), fake.text("no")]);
    const r = await router(p).route(customer("?"));
    expect(r.decision).toEqual(FALLBACK_DECISION);
    expect(r.fallback).toBe(true);
    expect(r.calls).toHaveLength(2);
  });

  it("extractJson rejects text without an object", () => {
    expect(() => extractJson("nothing here")).toThrow();
  });
});
