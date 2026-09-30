import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { agreementOf, pairsBetweenJudges, pairsFromOutputs, pairsWithHuman, report, wilson, type Pair } from "../../src/evals/judge/agreement.ts";
import type { JudgeInput } from "../../src/evals/judge/judge.ts";
import { gradingQuestions, parseScore, parseYesNo, renderGradingItem, sampleForGrading, type JudgedConversation, type KeyEntry } from "../../src/evals/judge/sample.ts";

const MODELS = ["gemini/gemini-3.5-flash-lite", "groq/gpt-oss-120b", "groq/qwen3.8-27b", "modal/small"];

function conversation(model: string, i: number, turns = 1): JudgedConversation {
  const input: JudgeInput = {
    caseId: `case-${i}`,
    turns: Array.from({ length: turns }, (_, t) => ({ turn: t + 1, customer: `question ${i}.${t + 1}`, reply: `answer ${i}.${t + 1}` })),
    toolSummary: [`message 1: get_order({"orderId":${1000 + i}}) → {"ok":true}`],
    judgeNote: `note ${i}`,
    checks: [{ id: "judge:0", statement: "The agent was polite." }],
    scriptFit: turns > 1 ? [{ id: "script:2", turn: 2, assumes: "the agent asked something" }] : [],
  };
  const replies = input.turns.map((t) => ({ reply: t.turn, tone: 4, clarity: 4, helpfulness: 3, why: "ok" }));
  return {
    runId: `${model}#${i}`,
    caseId: input.caseId,
    agentModel: model,
    input,
    judge: { model: "gemini/gemma-4-31b", rubric: "rubric@1#abcd1234", output: { replies, checks: [{ id: "judge:0", answer: true, why: "ok" }], scriptFit: input.scriptFit.map((s) => ({ id: s.id, answer: true, why: "ok" })) } },
  };
}

const pool = MODELS.flatMap((m, mi) => Array.from({ length: 12 }, (_, i) => conversation(m, mi * 100 + i, i % 3 === 0 ? 2 : 1)));

describe("drawing the blind sample", () => {
  const { items, key } = sampleForGrading(pool, 30);

  it("takes 30 replies, spread evenly across agent models, one per conversation", () => {
    expect(items).toHaveLength(30);
    const perModel = MODELS.map((m) => key.filter((k) => k.agentModel === m).length);
    expect(perModel.sort()).toEqual([7, 7, 8, 8]);
    expect(new Set(key.map((k) => k.runId)).size).toBe(30);
  });

  it("hides the model and the judge's scores from what Julian sees, and shuffles the order", () => {
    const shown = JSON.stringify(items);
    for (const m of [...MODELS, "gemma", "rubric@1"]) expect(shown).not.toContain(m);
    expect(shown).not.toMatch(/"tone"|"helpfulness"/);
    expect(items.map((i) => i.itemId)).toEqual(Array.from({ length: 30 }, (_, i) => `G${String(i + 1).padStart(2, "0")}`));
    // Shuffled: consecutive items aren't grouped by model.
    const runs = key.slice(1).filter((k, i) => k.agentModel !== key[i]!.agentModel).length;
    expect(runs).toBeGreaterThan(10);
  });

  it("keeps the judge's scores for the sampled reply in the key", () => {
    const k = key[0]!;
    expect(k.judge).toEqual({ model: "gemini/gemma-4-31b", rubric: "rubric@1#abcd1234", scores: { tone: 4, clarity: 4, helpfulness: 3 }, answers: expect.objectContaining({ "judge:0": true }) });
    expect(items[0]!.input.turns.some((t) => t.turn === k.reply)).toBe(true);
  });

  it("is reproducible, skips conversations the judge failed on, and copes with fewer than 30", () => {
    expect(sampleForGrading(pool, 30)).toEqual(sampleForGrading(pool, 30));
    const few = [conversation(MODELS[0]!, 1), { ...conversation(MODELS[1]!, 2), judge: null }];
    expect(sampleForGrading(few, 30).key.map((k) => k.runId)).toEqual([`${MODELS[0]}#1`]);
  });
});

describe("what Julian sees and answers", () => {
  const item = { itemId: "G07", reply: 2, input: conversation(MODELS[0]!, 5, 2).input };

  it("shows the same inputs the judge saw, with the reply to grade marked", () => {
    const text = renderGradingItem(item, 7, 30);
    expect(text).toContain("=== G07 (7 of 30): grade agent reply 2 ===");
    expect(text).toContain("  Agent 1: answer 5.1");
    expect(text).toContain("▶ Agent 2: answer 5.2");
    expect(text).toContain('get_order({"orderId":1005})');
    expect(text).toContain("What a good answer does: note 5");
  });

  it("asks the same yes/no questions the judge answered", () => {
    expect(gradingQuestions(item)).toEqual([
      { id: "judge:0", prompt: "Judge check: The agent was polite." },
      { id: "script:2", prompt: "Script fit: customer message 2 assumes that the agent asked something. Does it fit agent reply 1?" },
    ]);
    expect([parseScore("4"), parseScore(" 5 "), parseScore("0"), parseScore("4.5"), parseScore("x")]).toEqual([4, 5, null, null, null]);
    expect([parseYesNo("Y"), parseYesNo("no"), parseYesNo("maybe")]).toEqual([true, false, null]);
  });
});

describe("agreement", () => {
  it("Wilson intervals match known values", () => {
    const [lo, hi] = wilson(8, 10);
    expect(lo).toBeCloseTo(0.49, 2);
    expect(hi).toBeCloseTo(0.943, 2);
    expect(wilson(30, 30)[1]).toBe(1);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });

  it("counts exact and within-±1 matches, the mean difference, and yes/no agreement, per agent model", () => {
    const side = (tone: number, yes: boolean) => ({ tone, clarity: 3, helpfulness: 3, answers: { "judge:0": yes } });
    const pairs: Pair[] = [
      { agentModel: "m1", a: side(5, true), b: side(5, true) },
      { agentModel: "m1", a: side(4, true), b: side(5, false) },
      { agentModel: "m2", a: side(5, true), b: side(2, true) },
    ];
    const a = agreementOf(pairs);
    expect(a.dimensions.tone.exact).toMatchObject({ agree: 1, n: 3 });
    expect(a.dimensions.tone.within1).toMatchObject({ agree: 2, n: 3 });
    expect(a.dimensions.tone.meanDiff).toBeCloseTo((0 - 1 + 3) / 3);
    expect(a.dimensions.clarity.exact).toMatchObject({ agree: 3, n: 3 });
    expect(a.answers).toMatchObject({ agree: 2, n: 3 });
    const r = report(pairs);
    expect(r.byModel.m1!.dimensions.tone.exact.agree).toBe(1);
    expect(r.byModel.m2!.dimensions.tone.within1.agree).toBe(0);
  });

  it("pairs judges with Julian and with each other, leaving out what's missing", () => {
    const v = (tone: number) => ({ model: "j", rubric: "r", scores: { tone, clarity: 3, helpfulness: 3 }, answers: {} });
    const key: KeyEntry[] = [
      { itemId: "G01", runId: "a", caseId: "c", agentModel: "m1", reply: 1, judge: v(4), second: v(5) },
      { itemId: "G02", runId: "b", caseId: "c", agentModel: "m2", reply: 1, judge: v(3), second: null },
    ];
    const grades = { G01: { tone: 4, clarity: 3, helpfulness: 3, answers: {} } };
    expect(pairsWithHuman(key, grades, "judge")).toHaveLength(1);
    expect(pairsWithHuman(key, grades, "second")).toHaveLength(1);
    expect(pairsBetweenJudges(key)).toEqual([{ agentModel: "m1", a: expect.objectContaining({ tone: 4 }), b: expect.objectContaining({ tone: 5 }) }]);
  });
});

describe("two judges on a whole run", () => {
  it("pairs every reply's scores, but counts each conversation's yes/no answers once", () => {
    const out = (tone: number, answer: boolean) => ({
      replies: [1, 2].map((reply) => ({ reply, tone, clarity: 4, helpfulness: 4, why: "x" })),
      checks: [{ id: "judge:timing", answer, why: "x" }],
      scriptFit: [{ id: "script:2", answer: true, why: "x" }],
    });
    const pairs = pairsFromOutputs([{ agentModel: "m1", a: out(4, true), b: out(5, false) }]);
    expect(pairs).toHaveLength(2);
    const a = agreementOf(pairs);
    expect(a.dimensions.tone).toMatchObject({ exact: { agree: 0, n: 2 }, meanDiff: -1 });
    expect(a.answers).toMatchObject({ agree: 1, n: 2 }); // judge:timing disagrees, script:2 agrees; not doubled by the two replies
  });
});

describe("the grading and agreement commands, end to end", () => {
  const server = fileURLToPath(new URL("../..", import.meta.url));
  const runScript = (script: string, args: string[], stdin = "") =>
    spawnSync(process.execPath, [join(server, "src/scripts", script), ...args], { input: stdin, encoding: "utf8", cwd: server });

  it("grades with piped answers, saves after each item, resumes, and reports agreement", () => {
    const dir = mkdtempSync(join(tmpdir(), "grading-"));
    const from = join(dir, "judged.jsonl");
    writeFileSync(from, pool.slice(0, 3).map((c) => JSON.stringify(c)).join("\n"));
    const out = join(dir, "sample");
    expect(runScript("judge-sample.ts", ["--from", from, "--out", out, "--size", "3"]).status).toBe(0);
    // A second draw into the same directory is refused.
    expect(runScript("judge-sample.ts", ["--from", from, "--out", out]).status).toBe(1);

    const items = JSON.parse(readFileSync(join(out, "sample.json"), "utf8")) as { itemId: string; input: JudgeInput }[];
    const answersFor = (i: number) => {
      const it = items[i]!;
      const n = it.input.checks.length + it.input.scriptFit.length;
      return ["4", "4", "3", ...Array(n).fill("y"), ""].join("\n");
    };
    // Grade one item, then stop.
    const first = runScript("judge-grade.ts", [out], `${answersFor(0)}\nq\n`);
    expect(first.stdout).toContain("Stopped. 1 of 3 graded");
    expect(first.stdout).not.toMatch(/gemini|groq|gemma|rubric@1#/);
    // The agreement report refuses until everything is graded.
    expect(runScript("judge-agreement.ts", [out]).status).toBe(1);
    // Resume: only the remaining two are asked.
    const second = runScript("judge-grade.ts", [out], `${answersFor(1)}\n${answersFor(2)}\n`);
    expect(second.stdout).toContain("1 of 3 already graded");
    expect(second.stdout).toContain("All 3 graded.");

    const agreement = runScript("judge-agreement.ts", [out]);
    expect(agreement.status).toBe(0);
    // The fake judge scored 4/4/3 and said yes, exactly like the piped grades.
    expect(agreement.stdout).toContain("| tone | 100% (3/3");
    expect(readFileSync(join(out, "agreement.md"), "utf8")).toContain("First judge (gemini/gemma-4-31b) vs Julian");
  });
});
