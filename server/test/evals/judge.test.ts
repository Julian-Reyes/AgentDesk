import { describe, expect, it } from "vitest";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { finalizeGrade, type CaseGrade } from "../../src/evals/grading/grade.ts";
import { buildJudgeInput, judgeSafeText, renderJudgeInput, runJudge, stripThoughts, summarizeTools, type JudgeInput } from "../../src/evals/judge/judge.ts";
import { JUDGE_RUBRIC } from "../../src/evals/judge/rubric.ts";
import type { Observation } from "../../src/evals/run-case.ts";
import { FakeProvider, fake } from "../../src/llm/fake.ts";

const c = ALL_CASES.find((x) => x.id === "refund-within-limit-03")!;
const obs: Observation = {
  runId: "r1",
  turns: [
    { customer: c.turns[0]!.customer, reply: "Which item is broken?", answeredBy: "support", outcome: "resolved" },
    { customer: c.turns[1]!.customer, reply: "Refunded $14.99 for the Firefly Kids Headlamp.", answeredBy: "support", outcome: "resolved" },
  ],
  steps: [
    { turn: 1, kind: "tool_call", data: { name: "get_order", arguments: '{"orderId":1074}', result: { ok: true, data: { number: 1074, items: ["x".repeat(2000)] } } } },
    { turn: 1, kind: "tool_call", data: { name: "reply", arguments: '{"message":"Which item is broken?"}', result: { ok: true, data: { message: "Which item is broken?" } } } },
    { turn: 2, kind: "tool_call", data: { name: "issue_refund", arguments: '{"orderId":1074,"amount":14.99}', result: { ok: true, data: { status: "refunded" } } } },
  ],
  finalAgent: "support",
  outcome: "resolved",
  effects: { refunds: [], goodwill: [], escalations: 0 },
};
const questions: CaseGrade["judgeQuestions"] = [
  { id: "judge:0", kind: "judge_check", statement: c.expect.judgeChecks[0]! },
  { id: "script:2", kind: "script_fit", turn: 2, assumes: c.turns[1]!.assumes!, previousReply: "Which item is broken?" },
];
const input = buildJudgeInput(c, obs, questions);

const good = {
  replies: [
    { reply: 1, tone: 4, clarity: 5, helpfulness: 5, why: "Asks the right question." },
    { reply: 2, tone: 5, clarity: 5, helpfulness: 5, why: "Confirms the refund." },
  ],
  checks: [{ id: "judge:0", answer: true, why: "It asked which item." }],
  scriptFit: [{ id: "script:2", answer: true, why: "The customer answers the question." }],
};

describe("the judge's input", () => {
  it("has the conversation, a trimmed tool summary without the reply tool, the case's note, and the questions", () => {
    expect(input.turns.map((t) => t.turn)).toEqual([1, 2]);
    expect(input.toolSummary).toHaveLength(2);
    expect(input.toolSummary[0]).toMatch(/^message 1: get_order\(\{"orderId":1074\}\) → .*… \(trimmed\)$/);
    expect(input.toolSummary[1]).toMatch(/^message 2: issue_refund/);
    expect(summarizeTools(obs).some((l) => l.includes("reply("))).toBe(false);
    expect(input.checks).toEqual([{ id: "judge:0", statement: c.expect.judgeChecks[0] }]);
    expect(input.scriptFit).toEqual([{ id: "script:2", turn: 2, assumes: "the agent asked which item is broken or what's wrong with it" }]);
    const text = renderJudgeInput(input);
    expect(text).toContain("Agent reply 2: Refunded $14.99");
    expect(text).toContain("script:2: customer message 2 assumes that the agent asked which item is broken or what's wrong with it. Does it fit agent reply 1?");
  });

  it("never names the model that wrote the replies", () => {
    expect(JSON.stringify(input)).not.toMatch(/groq|gemini|ollama|gpt|qwen|fake/i);
  });
});

describe("runJudge", () => {
  it("returns scores and yes/no answers that finalizeGrade can use", async () => {
    const judge = new FakeProvider([fake.text(JSON.stringify(good))]);
    const r = await runJudge(judge, input);
    expect(r.ok && r.answers).toEqual({ "judge:0": true, "script:2": true });
    expect(r.rubric).toMatch(/^rubric@1#[0-9a-f]{8}$/);
    // The rubric is the system prompt, and JSON output is requested.
    expect(judge.requests[0]!.messages[0]).toEqual({ role: "system", content: JUDGE_RUBRIC.text });
    expect(judge.requests[0]!.responseFormat).toBe("json");
    const grade = { caseId: c.id, checks: [], grounding: [], judgeQuestions: questions, counts: { policyViolations: 0, groundingViolations: 0, forbiddenAttempts: 0, failedChecks: 0 }, codeStatus: "pass" as const };
    expect(finalizeGrade(grade, r.ok ? r.answers : {}).status).toBe("pass");
  });

  it("reads JSON after a <thought> block, even one containing braces (seen from Gemma 4)", async () => {
    const raw = `<thought>The customer said {something}. Reply 1 asks…</thought>\n${JSON.stringify(good)}`;
    expect(JSON.parse(stripThoughts(raw))).toEqual(good);
    const r = await runJudge(new FakeProvider([fake.text(raw)]), input);
    expect(r.ok).toBe(true);
  });

  it("retries once with the problem when a reply or question is missing, then succeeds", async () => {
    const missing = { ...good, scriptFit: [] };
    const judge = new FakeProvider([fake.text(JSON.stringify(missing)), fake.text(JSON.stringify(good))]);
    const r = await runJudge(judge, input);
    expect(r.ok).toBe(true);
    expect(r.calls.map((x) => x.error ?? "ok")).toEqual(["answer exactly these script-fit ids: script:2", "ok"]);
    expect(judge.requests[1]!.messages.at(-1)!.content).toMatch(/invalid: answer exactly these script-fit ids: script:2/);
  });

  it("rejects out-of-range scores and extra ids, and gives up after two bad answers", async () => {
    const bad = { ...good, replies: [{ ...good.replies[0]!, tone: 7 }, good.replies[1]!] };
    const extra = { ...good, checks: [...good.checks, { id: "judge:9", answer: true, why: "x" }] };
    const r = await runJudge(new FakeProvider([fake.text(JSON.stringify(bad)), fake.text(JSON.stringify(extra))]), input);
    expect(r.ok).toBe(false);
    expect(r.calls).toHaveLength(2);
    expect(r.calls[0]!.error).toMatch(/tone/);
    expect(!r.ok && r.error).toBe("answer exactly these checks: judge:0");
  });

  it("accepts a case with no questions and a single reply", async () => {
    const one: JudgeInput = { ...input, turns: [input.turns[0]!], checks: [], scriptFit: [] };
    const r = await runJudge(new FakeProvider([fake.text(JSON.stringify({ replies: [good.replies[0]] }))]), one);
    expect(r.ok && r.answers).toEqual({});
  });
});

describe("judge-safe text (Gemma 4 returned HTTP 500 for input containing °)", () => {
  it("turns typographic characters into plain ASCII without changing the meaning", () => {
    expect(judgeSafeText("Harbor 3°C Double, rated to -5 °C (23°F), 90° angle")).toBe("Harbor 3 degrees C Double, rated to -5 degrees C (23 degrees F), 90 degrees angle");
    expect(judgeSafeText("It\u2019s \u201cgreat\u201d \u2013 get_order(1) \u2192 ok\u2026 2\u00d7")).toBe(`It's "great" - get_order(1) -> ok... 2x`);
  });

  it("is applied to everything the judge sees, including tool results", () => {
    const text = renderJudgeInput({ ...input, toolSummary: ['message 1: get_order → {"name":"Harbor 3°C Double Sleeping Bag"}'] });
    expect(text).toContain('get_order -> {"name":"Harbor 3 degrees C Double Sleeping Bag"}');
    expect(text).not.toMatch(/[^\x00-\x7F]/);
  });
});
