import { describe, expect, it } from "vitest";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { finalizeGrade, type CaseGrade } from "../../src/evals/grading/grade.ts";
import { buildJudgeInput, judgeSafeText, questionsOf, renderQuestionRequest, renderScoreRequest, runJudge, statedConclusion, stripThoughts, summarizeTools, type JudgeInput } from "../../src/evals/judge/judge.ts";
import { QUESTION_PROMPT, SCORE_PROMPT } from "../../src/evals/judge/rubric.ts";
import type { ChatRequest } from "../../src/llm/types.ts";
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

const scores = [
  { reply: 1, tone: 4, clarity: 5, helpfulness: 5, why: "Asks the right question." },
  { reply: 2, tone: 5, clarity: 5, helpfulness: 5, why: "Confirms the refund." },
];
const withGlobals: CaseGrade["judgeQuestions"] = [
  ...questions,
  { id: "judge:followup", kind: "judge_check", statement: "No follow-up promises." },
  { id: "judge:timing", kind: "judge_check", statement: "No unsupported timing." },
];

/**
 * A scripted judge that answers whatever it's asked: scores for the scoring call,
 * and for a question call the answer given for that question's id (a list =
 * one answer per vote). Requests are recorded by the FakeProvider.
 */
function responder(answers: Record<string, boolean | boolean[]>, opts: { scores?: unknown } = {}) {
  return (req: ChatRequest) => {
    const user = String(req.messages[1]!.content);
    if (req.messages[0]!.content === SCORE_PROMPT) return fake.text(JSON.stringify(opts.scores ?? { replies: scores }));
    const q = /^(Judge check|Script-fit question): (.*)$/m.exec(user)![2]!;
    const id = Object.keys(answers).find((k) => q.includes(statementOf[k]!))!;
    const vote = Number(/vote (\d) of/.exec(user)?.[1] ?? 1);
    const a = answers[id]!;
    const answer = Array.isArray(a) ? a[vote - 1]! : a;
    return fake.text(JSON.stringify({ why: `${id} vote ${vote}. Answer: ${answer ? "yes" : "no"}.`, answer }));
  };
}
const statementOf: Record<string, string> = {
  "judge:0": c.expect.judgeChecks[0]!,
  "script:2": "assumes that the agent asked which item is broken",
  "judge:followup": "No follow-up promises.",
  "judge:timing": "No unsupported timing.",
};
const judgeWith = (n: number, r: ReturnType<typeof responder>) => new FakeProvider(Array.from({ length: n }, () => r));
const userOf = (req: ChatRequest) => String(req.messages[1]!.content);

describe("runJudge (rubric@2): scores in one call, each question in its own", () => {
  it("returns scores and yes/no answers that finalizeGrade can use", async () => {
    const judge = judgeWith(3, responder({ "judge:0": true, "script:2": true }));
    const r = await runJudge(judge, input);
    expect(r.ok && r.answers).toEqual({ "judge:0": true, "script:2": true });
    expect(r.ok && r.output.replies).toEqual(scores);
    expect(r.rubric).toMatch(/^rubric@3#[0-9a-f]{8}$/);
    expect(judge.requests.map((q) => q.messages[0]!.content)).toEqual([SCORE_PROMPT, QUESTION_PROMPT, QUESTION_PROMPT]);
    expect(judge.requests.every((q) => q.responseFormat === "json")).toBe(true);
    expect(r.calls.map((x) => x.purpose).sort()).toEqual(["judge:0", "scores", "script:2"]);
    const grade = { caseId: c.id, checks: [], grounding: [], judgeQuestions: questions, counts: { policyViolations: 0, groundingViolations: 0, forbiddenAttempts: 0, failedChecks: 0 }, codeStatus: "pass" as const };
    expect(finalizeGrade(grade, r.ok ? r.answers : {}).status).toBe("pass");
  });

  it("each question call sees the conversation, the case's note, and only its own question", async () => {
    const judge = judgeWith(3, responder({ "judge:0": true, "script:2": true }));
    await runJudge(judge, { ...input, judgeNote: "Asks which item first." });
    const [score, check, script] = judge.requests.map(userOf);
    expect(score).toContain("Agent reply 2: Refunded $14.99");
    expect(score).toContain("Asks which item first.");
    expect(score).toContain("Score agent replies 1, 2.");
    expect(check).toContain("Agent reply 2: Refunded $14.99");
    expect(check).toContain(`Judge check: ${c.expect.judgeChecks[0]}`);
    expect(check).not.toContain("Script-fit");
    expect(check).toContain("## What a good answer does\nAsks which item first.");
    expect(script).toContain("Script-fit question: customer message 2 assumes that the agent asked which item is broken or what's wrong with it. Does it fit agent reply 1?");
    expect(script).not.toContain("Judge check");
  });

  it("asks the follow-up and timing checks 3 times each and takes the majority; each vote is a distinct request", async () => {
    const all = buildJudgeInput(c, obs, withGlobals);
    const judge = judgeWith(9, responder({ "judge:0": true, "script:2": true, "judge:followup": [true, false, false], "judge:timing": [true, true, false] }));
    const r = await runJudge(judge, all);
    expect(judge.requests).toHaveLength(1 + 1 + 3 + 3 + 1);
    expect(r.ok && r.answers).toEqual({ "judge:0": true, "judge:followup": false, "judge:timing": true, "script:2": true });
    expect(r.ok && r.output.checks.find((x) => x.id === "judge:followup")).toEqual({ id: "judge:followup", answer: false, why: "judge:followup vote 2. Answer: no.", votes: [true, false, false] });
    expect(r.ok && r.output.checks.find((x) => x.id === "judge:0")!.votes).toBeUndefined();
    const followups = judge.requests.map(userOf).filter((u) => u.includes("No follow-up promises."));
    expect(followups.map((u) => /\(Independent vote (\d) of 3\.\)/.exec(u)?.[1])).toEqual(["1", "2", "3"]);
    expect(new Set(followups).size).toBe(3); // so the replay cache keeps three answers, not one
  });

  it("reads JSON after a <thought> block, even one containing braces (seen from Gemma 4)", async () => {
    const raw = `<thought>The customer said {something}. Reply 1 asks…</thought>\n${JSON.stringify({ why: "x. Answer: yes.", answer: true })}`;
    expect(JSON.parse(stripThoughts(raw))).toEqual({ why: "x. Answer: yes.", answer: true });
    const one: JudgeInput = { ...input, scriptFit: [] };
    const r = await runJudge(new FakeProvider([fake.text(JSON.stringify({ replies: scores })), fake.text(raw)]), one);
    expect(r.ok && r.answers).toEqual({ "judge:0": true });
  });

  it("retries a call once with the problem stated, then succeeds", async () => {
    const one: JudgeInput = { ...input, checks: [], scriptFit: [] };
    const judge = new FakeProvider([fake.text(JSON.stringify({ replies: [scores[0]] })), fake.text(JSON.stringify({ replies: scores }))]);
    const r = await runJudge(judge, one);
    expect(r.ok).toBe(true);
    expect(r.calls.map((x) => x.error ?? "ok")).toEqual(["score each agent reply exactly once: replies 1, 2", "ok"]);
    expect(judge.requests[1]!.messages.at(-1)!.content).toMatch(/invalid: score each agent reply exactly once: replies 1, 2/);
  });

  it("rejects out-of-range scores and a non-boolean answer, and fails the verdict after two bad answers to one call", async () => {
    const one: JudgeInput = { ...input, scriptFit: [] };
    const bad = { replies: [{ ...scores[0]!, tone: 7 }, scores[1]!] };
    let r = await runJudge(new FakeProvider([fake.text(JSON.stringify(bad)), fake.text(JSON.stringify({ why: "x. Answer: yes.", answer: true })), fake.text(JSON.stringify(bad))]), one);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/^scores: .*tone/s);
    r = await runJudge(new FakeProvider([fake.text(JSON.stringify({ replies: scores })), fake.text('{"why":"x. Answer: yes.","answer":"maybe"}'), fake.text('{"why":"x. Answer: yes.","answer":"yes"}')]), one);
    expect(!r.ok && r.error).toMatch(/^judge:0: /);
  });

  it("rubric@3: a reason must end with its conclusion; missing it is invalid output and gets the one retry", async () => {
    const one: JudgeInput = { ...input, scriptFit: [] };
    const judge = new FakeProvider([fake.text(JSON.stringify({ replies: scores })), fake.text('{"why":"It asked which item.","answer":true}'), fake.text('{"why":"It asked which item. Answer: yes.","answer":true}')]);
    const r = await runJudge(judge, one);
    expect(r.ok && r.answers).toEqual({ "judge:0": true });
    expect(r.calls.find((c) => c.purpose === "judge:0" && c.error)!.error).toMatch(/must end with "Answer: yes." or "Answer: no."/);
    // The reason comes first in the requested output.
    expect(QUESTION_PROMPT).toContain('{"why":"... Answer: yes.","answer":true}');
  });

  it("rubric@3: a vote whose reason concludes the opposite of its answer is flagged, not corrected", async () => {
    const all = buildJudgeInput(c, obs, withGlobals);
    // Vote 2 of the timing check reasons "yes" but answers false (the dev-1 refund-over-limit-02 pattern).
    const contradicting = (req: ChatRequest) => {
      const user = userOf(req);
      if (user.includes("No unsupported timing.") && user.includes("vote 2 of")) return fake.text(JSON.stringify({ why: "The timing matches the tool result. Answer: yes.", answer: false }));
      return responder({ "judge:0": true, "script:2": true, "judge:followup": true, "judge:timing": true })(req);
    };
    const r = await runJudge(judgeWith(9, contradicting), all);
    const timing = r.ok ? r.output.checks.find((x) => x.id === "judge:timing")! : undefined;
    expect(timing).toMatchObject({ answer: true, votes: [true, false, true], contradictions: [2] });
    expect(r.ok && r.output.checks.find((x) => x.id === "judge:0")!.contradictions).toBeUndefined();
    expect(statedConclusion("Fine. Answer: No.")).toBe(false);
  });

  it("a provider error on any call is thrown (the runner retries the conversation later)", async () => {
    const one: JudgeInput = { ...input, scriptFit: [] };
    await expect(runJudge(new FakeProvider([fake.text(JSON.stringify({ replies: scores })), new Error("HTTP 500")]), one)).rejects.toThrow("HTTP 500");
  });

  it("accepts a case with no questions and a single reply: one call", async () => {
    const one: JudgeInput = { ...input, turns: [input.turns[0]!], checks: [], scriptFit: [] };
    const judge = new FakeProvider([fake.text(JSON.stringify({ replies: [scores[0]] }))]);
    const r = await runJudge(judge, one);
    expect(r.ok && r.answers).toEqual({});
    expect(judge.requests).toHaveLength(1);
  });
});

describe("judge-safe text (Gemma 4 returned HTTP 500 for input containing °)", () => {
  it("turns typographic characters into plain ASCII without changing the meaning", () => {
    expect(judgeSafeText("Harbor 3°C Double, rated to -5 °C (23°F), 90° angle")).toBe("Harbor 3 degrees C Double, rated to -5 degrees C (23 degrees F), 90 degrees angle");
    expect(judgeSafeText("It\u2019s \u201cgreat\u201d \u2013 get_order(1) \u2192 ok\u2026 2\u00d7")).toBe(`It's "great" - get_order(1) -> ok... 2x`);
  });

  it("is applied to everything the judge sees, including tool results", () => {
    const odd: JudgeInput = { ...input, toolSummary: ['message 1: get_order → {"name":"Harbor 3°C Double Sleeping Bag"}'] };
    for (const text of [renderScoreRequest(odd), renderQuestionRequest(odd, questionsOf(odd)[0]!, { n: 1, of: 3 })]) {
      expect(text).toContain('get_order -> {"name":"Harbor 3 degrees C Double Sleeping Bag"}');
      expect(text).not.toMatch(/[^\x00-\x7F]/);
    }
  });
});
