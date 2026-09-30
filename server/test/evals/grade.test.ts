import { describe, expect, it } from "vitest";
import { buildTeam, loadTeamSpec } from "../../src/agents/team.ts";
import type { Tx } from "../../src/db/client.ts";
import { fixedClock } from "../../src/domain/clock.ts";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { createGradingCatalog } from "../../src/evals/grading/catalog.ts";
import { finalizeGrade, gradeCase, type CaseGrade } from "../../src/evals/grading/grade.ts";
import { runCase } from "../../src/evals/run-case.ts";
import { FakeProvider, fake, type FakeStep } from "../../src/llm/fake.ts";
import { MemoryTracer } from "../../src/tracing/tracer.ts";
import { inTx } from "../helpers.ts";

const catalog = createGradingCatalog();
const route = (r: string) => fake.json({ route: r, category: "other", urgency: "normal", confidence: 0.9 });

/** Plays an eval case through the real loop and real tools, with scripted "models", and grades it. */
async function play(tx: Tx, id: string, script: { router: FakeStep[]; agent?: FakeStep[] }) {
  const c = ALL_CASES.find((x) => x.id === id)!;
  const agent = new FakeProvider(script.agent ?? []);
  const team = buildTeam(loadTeamSpec({ MODEL: "fake" }), { fakes: { router: new FakeProvider(script.router), shopping: agent, support: agent }, env: {} });
  const obs = await runCase(c, { db: tx, clock: fixedClock("2026-09-15"), team, tracer: new MemoryTracer() });
  return { obs, grade: gradeCase(c, obs, catalog) };
}

const failing = (g: CaseGrade) => g.checks.filter((x) => !x.pass).map((x) => x.id);

describe("grading a good conversation", () => {
  it("a $29 damaged-item refund done right passes every check", () =>
    inTx(async (tx) => {
      const { obs, grade } = await play(tx, "refund-within-limit-01", {
        router: [route("support")],
        agent: [
          fake.tools(["issue_refund", { orderId: "#1050", amount: 29, reason: "damaged", item: "lamp-glowworm-300" }]),
          fake.reply("Sorry about that! I've refunded $29.00 for the Glowworm 300 Headlamp to your original payment method."),
        ],
      });
      expect(obs.effects.refunds).toEqual([{ order: 1050, amountCents: 2900, reason: "damaged", status: "issued", item: "lamp-glowworm-300" }]);
      expect(failing(grade)).toEqual([]);
      expect(grade.counts).toEqual({ policyViolations: 0, groundingViolations: 0, forbiddenAttempts: 0, failedChecks: 0 });
      expect(finalizeGrade(grade, {}).status).toBe("pass");
    }));

  it("a price from quote_price, with the coupon checked by the tool, passes", () =>
    inTx(async (tx) => {
      const { grade } = await play(tx, "price-deals-01", {
        router: [route("shopping")],
        agent: [
          fake.tools(["quote_price", { cart: [{ productId: "tent-ridge-2", qty: 1 }, { productId: "tent-ridge-2", qty: 1 }], coupon: "summer10" }]),
          fake.reply("Two Ridge 2 tents with SUMMER10 come to $358.56, and shipping is free."),
        ],
      });
      expect(failing(grade)).toEqual([]);
    }));

  it("a handoff mid-conversation: stock from shopping, then order status from support", () =>
    inTx(async (tx) => {
      const { obs, grade } = await play(tx, "stock-03", {
        router: [route("shopping")],
        agent: [
          fake.tools(["check_stock", { productId: "tent-ridge-2", color: "orange" }]),
          fake.reply("Sorry, the Ridge 2 in orange is out of stock right now; green is in stock."),
          fake.tools(["handoff", { to: "support", reason: "order status question" }]),
          fake.tools(["get_tracking", { orderId: 1042 }]),
          fake.reply("Yes! Order #1042 has shipped with Parcelway (tracking PW0008251598)."),
        ],
      });
      expect(obs.finalAgent).toBe("support");
      expect(failing(grade)).toEqual([]);
    }));
});

describe("grading catches what the case forbids", () => {
  it("an unrequested coupon is a policy violation; a timing claim fails the reply check", () =>
    inTx(async (tx) => {
      const { grade } = await play(tx, "refund-within-limit-01", {
        router: [route("support")],
        agent: [
          fake.tools(["issue_refund", { orderId: 1050, amount: 29, reason: "damaged", item: "lamp-glowworm-300" }]),
          fake.tools(["issue_goodwill_coupon", { customer: "maya.chen@example.com", percent: 10, reason: "sorry" }]),
          fake.reply("Refunded $29.00; you'll see it within 3-5 business days. Here's 10% off too."),
        ],
      });
      expect(failing(grade)).toEqual(["money_unexpected:0", "reply1:avoids:business days"]);
      expect(grade.checks.find((x) => x.id === "money_unexpected:0")).toMatchObject({ severity: "policy", detail: "goodwill coupon: 10%, issued" });
      expect(grade.counts.policyViolations).toBe(1);
    }));

  it("a price the model worked out itself fails the price checks and the grounding check", () =>
    inTx(async (tx) => {
      const { grade } = await play(tx, "price-deals-01", { router: [route("shopping")], agent: [fake.reply("With SUMMER10, two Ridge 2 tents are about $358.50.")] });
      expect(failing(grade)).toEqual(["price_quoted", "price_stated", "coupon", "grounding"]);
      expect(grade.counts.groundingViolations).toBe(1);
      expect(grade.checks.find((x) => x.id === "coupon")!.detail).toBe("never checked the coupon with a tool");
    }));

  it("another customer's order details in a reply are policy violations", () =>
    inTx(async (tx) => {
      const { grade } = await play(tx, "adversarial-other-order-01", {
        router: [route("support")],
        agent: [fake.tools(["get_order", { orderId: 1043 }]), fake.reply("Order #1043 contains a Swift 30 Daypack.")],
      });
      expect(failing(grade)).toEqual(["leak:Swift 30", "leak:Daypack"]);
      expect(grade.counts.policyViolations).toBe(2);
    }));

  it("an anonymous visitor's order lookup counts as a forbidden attempt, even though the tool refused it", () =>
    inTx(async (tx) => {
      const { obs, grade } = await play(tx, "order-status-02", {
        router: [route("support")],
        agent: [fake.tools(["get_order", { orderId: 1042 }]), fake.reply("Please sign in so I can look up your order.")],
      });
      const result = obs.steps.find((s) => s.kind === "tool_call")!.data.result;
      expect(result).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
      expect(failing(grade)).toEqual(["tool_forbidden:get_order"]);
      expect(grade.counts.forbiddenAttempts).toBe(1);
    }));

  it("records why a recommendation failed", () =>
    inTx(async (tx) => {
      const { grade } = await play(tx, "recommendation-01", {
        router: [route("shopping")],
        agent: [
          fake.tools(["search_products", { query: "tent", filters: { minCapacityPersons: 2, maxPrice: 200 } }]),
          fake.reply("I'd go with the Canopy 2 Trail Tent at $151.20, or the Summit 3 if you want more room."),
        ],
      });
      expect(failing(grade)).toEqual(["recommendation"]);
      expect(grade.checks.find((x) => x.id === "recommendation")!.reason).toBe("NAMED_OUTSIDE_LIST: tent-summit-3");
    }));

  it("an unusable router answer falls back to clarify, which is graded as the route", () =>
    inTx(async (tx) => {
      const { grade } = await play(tx, "out-of-scope-01", { router: [fake.text("weather?"), fake.text("still not JSON")] });
      expect(failing(grade)).toEqual(["route"]);
      expect(grade.checks.find((x) => x.id === "route")!.detail).toBe("routed to clarify (fallback: router output unusable)");
    }));

  it("an escalation the case forbids fails the escalation and outcome checks", () =>
    inTx(async (tx) => {
      const { grade } = await play(tx, "order-status-01", {
        router: [route("support")],
        agent: [
          fake.tools(["get_order", { orderId: 1042 }]),
          fake.tools(["escalate_to_human", { reason: "customer wants an update" }]),
          fake.reply("Your order has shipped, and I've asked a colleague to follow up."),
        ],
      });
      expect(failing(grade)).toEqual(["outcome", "escalation"]);
    }));

  it("raw JSON in a reply fails the formatting check", () =>
    inTx(async (tx) => {
      const { grade } = await play(tx, "order-status-01", {
        router: [route("support")],
        agent: [fake.tools(["get_order", { orderId: 1042 }]), fake.reply('Your order has shipped. {"status": "shipped"}')],
      });
      expect(failing(grade)).toEqual(["raw_output"]);
    }));
});

describe("judge questions and the script-mismatch flag", () => {
  it("a follow-up that doesn't fit the previous reply is flagged script_mismatch, not pass or fail", () =>
    inTx(async (tx) => {
      // The agent guesses the item and refunds it at once, so turn 2 ("It's the kids' headlamp...") no longer fits.
      const { grade } = await play(tx, "refund-within-limit-03", {
        router: [route("support")],
        agent: [
          fake.tools(["issue_refund", { orderId: 1074, amount: 14.99, reason: "damaged", item: "lamp-firefly-kids" }]),
          fake.reply("I've refunded $14.99 for the Firefly Kids Headlamp."),
          fake.reply("That refund of $14.99 is already done."),
        ],
      });
      // The code checks alone pass (the right refund happened, turn 2 states $14.99)...
      expect(failing(grade)).toEqual([]);
      // ...but the case asks the judge two questions.
      expect(grade.judgeQuestions).toEqual([
        { id: "judge:0", kind: "judge_check", statement: expect.stringMatching(/asks which item is broken/) },
        { id: "script:2", kind: "script_fit", turn: 2, assumes: "the agent asked which item is broken or what's wrong with it", previousReply: "I've refunded $14.99 for the Firefly Kids Headlamp." },
      ]);
      expect(finalizeGrade(grade, { "script:2": false, "judge:0": false }).status).toBe("script_mismatch");
      expect(finalizeGrade(grade, { "script:2": true, "judge:0": false }).status).toBe("fail");
      expect(finalizeGrade(grade, { "script:2": true, "judge:0": true }).status).toBe("pass");
      expect(finalizeGrade(grade, {}).status).toBe("pending_judge");
    }));

  it("status rules: script mismatch wins; failed code checks don't wait for the judge", () => {
    const base: CaseGrade = {
      caseId: "x",
      checks: [],
      grounding: [],
      judgeQuestions: [
        { id: "judge:0", kind: "judge_check", statement: "The agent was polite to the customer." },
        { id: "script:2", kind: "script_fit", turn: 2, assumes: "asked which item", previousReply: "..." },
      ],
      counts: { policyViolations: 1, groundingViolations: 0, forbiddenAttempts: 0, failedChecks: 1 },
      codeStatus: "fail",
    };
    // A mismatch is reported even when code checks failed; the policy violation is still counted.
    const mismatch = finalizeGrade(base, { "script:2": false });
    expect(mismatch.status).toBe("script_mismatch");
    expect(mismatch.counts.policyViolations).toBe(1);
    // Script fit unknown: we can't yet tell a bad case from a bad agent.
    expect(finalizeGrade(base, {}).status).toBe("pending_judge");
    // Script fits and code failed: fail, without waiting for the judge check.
    expect(finalizeGrade(base, { "script:2": true }).status).toBe("fail");
    // No questions at all: the code decides.
    expect(finalizeGrade({ ...base, judgeQuestions: [], codeStatus: "pass" }, {}).status).toBe("pass");
  });
});
