import { z } from "zod";
import { promptId } from "../../agents/prompts.ts";
import { extractJson } from "../../agents/router.ts";
import type { ChatMessage, ChatProvider, ChatResponse } from "../../llm/types.ts";
import type { EvalCase } from "../case-schema.ts";
import type { JudgeQuestion } from "../grading/grade.ts";
import type { Observation } from "../run-case.ts";
import { JUDGE_RUBRIC, QUESTION_PROMPT, SCORE_PROMPT, VOTED_QUESTIONS, VOTES } from "./rubric.ts";

/**
 * The LLM judge (rubric@2, 2026-10-01). Per conversation:
 *  - one call scores every agent reply (tone, clarity, helpfulness, 1-5)
 *  - one call per yes/no question (the case's judge checks, the global checks,
 *    script fit), each seeing only its own question
 *  - the follow-up and timing checks are asked VOTES times; the majority wins
 * The calls run in parallel; the provider's throttle paces them. Julian's
 * grading tool shows him the same JudgeInput, so the two can be compared fairly.
 */

export type JudgeInput = {
  caseId: string;
  turns: { turn: number; customer: string; reply: string }[];
  /** What the tools returned, one line per call, so helpfulness is judged against what was knowable. */
  toolSummary: string[];
  judgeNote?: string;
  checks: { id: string; statement: string }[];
  scriptFit: { id: string; turn: number; assumes: string }[];
};

/** Long enough that a policy text (e.g. refund timing) reaches the judge whole, for the timing check. */
const MAX_RESULT_CHARS = 1500;

/** One line per tool call: which tool, with what, and what came back (trimmed). The reply tool is left out: it's the reply itself. */
export function summarizeTools(obs: Observation): string[] {
  return obs.steps
    .filter((s) => s.kind === "tool_call" && (s.data as { name: string }).name !== "reply")
    .map((s) => {
      const d = s.data as { name: string; arguments: string; result: unknown };
      const result = JSON.stringify(d.result);
      const trimmed = result.length > MAX_RESULT_CHARS ? `${result.slice(0, MAX_RESULT_CHARS)}… (trimmed)` : result;
      return `message ${s.turn}: ${d.name}(${d.arguments}) → ${trimmed}`;
    });
}

export function buildJudgeInput(c: EvalCase, obs: Observation, questions: JudgeQuestion[]): JudgeInput {
  return {
    caseId: c.id,
    turns: obs.turns.map((t, i) => ({ turn: i + 1, customer: t.customer, reply: t.reply })),
    toolSummary: summarizeTools(obs),
    ...(c.expect.judge ? { judgeNote: c.expect.judge } : {}),
    checks: questions.flatMap((q) => (q.kind === "judge_check" ? [{ id: q.id, statement: q.statement }] : [])),
    scriptFit: questions.flatMap((q) => (q.kind === "script_fit" ? [{ id: q.id, turn: q.turn, assumes: q.assumes }] : [])),
  };
}

/**
 * Typographic characters as plain ASCII: "3 degrees C", straight quotes, plain
 * dashes, "->". The meaning is unchanged. Added after Gemma 4 31B returned HTTP
 * 500 on 8/8 attempts for a conversation containing "Harbor 3°C" and judged it
 * without the "°" at the first try (2026-09-30). But on the next run, two
 * already-ASCII inputs that had been judged fine also got 500s, so the "°" is
 * NOT shown to be the cause: Gemma's free endpoint returns 500s intermittently.
 * Kept because it's harmless and removes one variable.
 */
export function judgeSafeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s*°\s*([CF])\b/g, " degrees $1")
    .replace(/°/g, " degrees")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u2026/g, "...")
    .replace(/[\u00d7]/g, "x");
}

/**
 * What every call sees: the conversation, what the tools returned, and the
 * case's note on a good answer. The note goes to the question calls too: case
 * checks rely on it (returns-02's "may mention the warranty"). A first rubric@2
 * version gave it to the scoring call only, and the judge then failed a reply
 * for mentioning the warranty (2026-10-01).
 */
function renderConversation(input: JudgeInput): string[] {
  const out: string[] = ["## Conversation"];
  for (const t of input.turns) out.push(`Customer message ${t.turn}: ${t.customer}`, `Agent reply ${t.turn}: ${t.reply}`, "");
  out.push("## What the tools returned", ...(input.toolSummary.length ? input.toolSummary : ["(no tools were called)"]), "");
  if (input.judgeNote) out.push("## What a good answer does", input.judgeNote, "");
  return out;
}

/** The scoring call's user message. */
export function renderScoreRequest(input: JudgeInput): string {
  const out = renderConversation(input);
  out.push(`Score agent replies ${input.turns.map((t) => t.turn).join(", ")}.`);
  return judgeSafeText(out.join("\n"));
}

export type JudgeQuestionText = { id: string; kind: "check" | "script"; text: string };

/** Every yes/no question in the input, as asked. */
export function questionsOf(input: JudgeInput): JudgeQuestionText[] {
  return [
    ...input.checks.map((c) => ({ id: c.id, kind: "check" as const, text: `Judge check: ${c.statement}` })),
    ...input.scriptFit.map((s) => ({
      id: s.id,
      kind: "script" as const,
      text: `Script-fit question: customer message ${s.turn} assumes that ${s.assumes}. Does it fit agent reply ${s.turn - 1}?`,
    })),
  ];
}

/**
 * One question's user message. A voted question names its vote, so each vote is
 * its own request: the replay cache would otherwise return the first vote's
 * answer three times, and at temperature 0 the votes need some difference to be
 * independent at all.
 */
export function renderQuestionRequest(input: JudgeInput, q: JudgeQuestionText, vote?: { n: number; of: number }): string {
  const out = renderConversation(input);
  out.push("## Your question", q.text);
  if (vote) out.push("", `(Independent vote ${vote.n} of ${vote.of}.)`);
  return judgeSafeText(out.join("\n"));
}

const Score = z.coerce.number().int().min(1).max(5);
const ReplyScore = z.object({ reply: z.coerce.number().int(), tone: Score, clarity: Score, helpfulness: Score, why: z.string().min(1) });
const ScoreOutput = z.object({ replies: z.array(ReplyScore) });
const AnswerOutput = z.object({ answer: z.boolean(), why: z.string().min(1) });
type AnswerOutput = z.infer<typeof AnswerOutput>;
/** votes: each vote's answer, for a voted question (`answer` is their majority). */
const Answer = z.object({ id: z.string(), answer: z.boolean(), why: z.string().min(1), votes: z.array(z.boolean()).optional() });
export const JudgeOutput = z.object({
  replies: z.array(ReplyScore),
  checks: z.array(Answer).default([]),
  scriptFit: z.array(Answer).default([]),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

/**
 * Gemma 4 writes a <thought>...</thought> block before its JSON even in JSON mode
 * (seen in the first real call, 2026-09-30). Braces inside the thoughts would
 * confuse the JSON extraction, so thought blocks are removed first.
 */
export function stripThoughts(raw: string): string {
  return raw.replace(/<thought>[\s\S]*?<\/thought>/gi, "").replace(/^[\s\S]*?<\/thought>/i, "").trim();
}

/** purpose: "scores", a question id, or "<id> vote <n>". */
export type JudgeCall = { purpose: string; response: ChatResponse; raw: string | null; error?: string };

export type JudgeResult =
  | { ok: true; rubric: string; output: JudgeOutput; answers: Record<string, boolean>; calls: JudgeCall[] }
  | { ok: false; rubric: string; error: string; calls: JudgeCall[] };

type Asked<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * One call, parsed and checked. On invalid output it retries once, stating the
 * problem. Provider errors are thrown (the runner retries those later).
 */
async function ask<T>(provider: ChatProvider, purpose: string, system: string, user: string, parse: (json: unknown) => T, calls: JudgeCall[]): Promise<Asked<T>> {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  let error = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await provider.chat({ messages, responseFormat: "json" });
    const raw = response.message.content;
    try {
      const value = parse(extractJson(stripThoughts(raw ?? "")));
      calls.push({ purpose, response, raw });
      return { ok: true, value };
    } catch (e) {
      error = e instanceof z.ZodError ? z.prettifyError(e) : (e as Error).message;
      calls.push({ purpose, response, raw, error });
      messages.push({ role: "assistant", content: raw ?? "" }, { role: "user", content: `That output was invalid: ${error}. Reply again with only the corrected JSON object.` });
    }
  }
  return { ok: false, error: `${purpose}: ${error}` };
}

const majority = (votes: boolean[]) => votes.filter(Boolean).length * 2 > votes.length;

/**
 * Judges one conversation (see the top of this file). All calls start at once,
 * in a fixed order (scores, then each question and vote). If any call's output
 * is still invalid after its retry, the verdict fails (judge_failed). A
 * provider error is thrown after every call has settled.
 */
export async function runJudge(provider: ChatProvider, input: JudgeInput): Promise<JudgeResult> {
  const rubric = promptId(JUDGE_RUBRIC);
  const calls: JudgeCall[] = [];
  const turns = input.turns.map((t) => t.turn);

  const scoreJob = ask(provider, "scores", SCORE_PROMPT, renderScoreRequest(input), (json) => {
    const replies = ScoreOutput.parse(json).replies;
    const got = replies.map((r) => r.reply);
    if (got.length !== turns.length || [...got].sort().join() !== [...turns].sort().join()) throw new Error(`score each agent reply exactly once: replies ${turns.join(", ")}`);
    return replies;
  }, calls);
  const questionJobs = questionsOf(input).map((q) => {
    const n = VOTED_QUESTIONS.includes(q.id) ? VOTES : 1;
    const votes = Array.from({ length: n }, (_, i) =>
      ask(provider, n > 1 ? `${q.id} vote ${i + 1}` : q.id, QUESTION_PROMPT, renderQuestionRequest(input, q, n > 1 ? { n: i + 1, of: n } : undefined), (json) => AnswerOutput.parse(json), calls),
    );
    return { q, votes, voted: n > 1 };
  });

  const settled = await Promise.allSettled([scoreJob, ...questionJobs.flatMap((j) => j.votes)]);
  const thrown = settled.find((x): x is PromiseRejectedResult => x.status === "rejected");
  if (thrown) throw thrown.reason;

  const scores = await scoreJob;
  if (!scores.ok) return { ok: false, rubric, error: scores.error, calls };
  const output: JudgeOutput = { replies: scores.value, checks: [], scriptFit: [] };
  for (const { q, votes, voted } of questionJobs) {
    const results: Asked<AnswerOutput>[] = await Promise.all(votes);
    const answers: AnswerOutput[] = [];
    for (const r of results) {
      if (!r.ok) return { ok: false, rubric, error: r.error, calls };
      answers.push(r.value);
    }
    const answer = majority(answers.map((a) => a.answer));
    const entry = { id: q.id, answer, why: answers.find((a) => a.answer === answer)!.why, ...(voted ? { votes: answers.map((a) => a.answer) } : {}) };
    (q.kind === "check" ? output.checks : output.scriptFit).push(entry);
  }
  const answers = Object.fromEntries([...output.checks, ...output.scriptFit].map((a) => [a.id, a.answer]));
  return { ok: true, rubric, output, answers, calls };
}
