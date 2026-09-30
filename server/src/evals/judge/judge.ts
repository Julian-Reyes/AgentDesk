import { z } from "zod";
import { promptId } from "../../agents/prompts.ts";
import { extractJson } from "../../agents/router.ts";
import type { ChatMessage, ChatProvider, ChatResponse } from "../../llm/types.ts";
import type { EvalCase } from "../case-schema.ts";
import type { JudgeQuestion } from "../grading/grade.ts";
import type { Observation } from "../run-case.ts";
import { JUDGE_RUBRIC } from "./rubric.ts";

/**
 * The LLM judge (rubric@1): one call per conversation scores every agent reply
 * (tone, clarity, helpfulness, 1-5) and answers the case's judge checks and
 * script-fit questions yes/no. Julian's grading tool shows him exactly the same
 * JudgeInput, so the two can be compared fairly.
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

const MAX_RESULT_CHARS = 600;

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

/** The user message: the conversation and the questions, as plain text. */
export function renderJudgeInput(input: JudgeInput): string {
  const out: string[] = ["## Conversation"];
  for (const t of input.turns) out.push(`Customer message ${t.turn}: ${t.customer}`, `Agent reply ${t.turn}: ${t.reply}`, "");
  out.push("## What the tools returned", ...(input.toolSummary.length ? input.toolSummary : ["(no tools were called)"]), "");
  if (input.judgeNote) out.push("## What a good answer does", input.judgeNote, "");
  out.push("## Judge checks", ...(input.checks.length ? input.checks.map((c) => `${c.id}: ${c.statement}`) : ["(none)"]), "");
  out.push(
    "## Script fit",
    ...(input.scriptFit.length
      ? input.scriptFit.map((s) => `${s.id}: customer message ${s.turn} assumes that ${s.assumes}. Does it fit agent reply ${s.turn - 1}?`)
      : ["(none)"]),
  );
  return out.join("\n");
}

const Score = z.coerce.number().int().min(1).max(5);
const Answer = z.object({ id: z.string(), answer: z.boolean(), why: z.string().min(1) });
export const JudgeOutput = z.object({
  replies: z.array(z.object({ reply: z.coerce.number().int(), tone: Score, clarity: Score, helpfulness: Score, why: z.string().min(1) })),
  checks: z.array(Answer).default([]),
  scriptFit: z.array(Answer).default([]),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

/** Beyond the shape: every reply scored once, every question answered once, nothing extra. */
function completeness(input: JudgeInput, out: JudgeOutput): string | null {
  const sameSet = (got: (string | number)[], want: (string | number)[]) =>
    got.length === want.length && [...got].sort().join() === [...want].sort().join();
  if (!sameSet(out.replies.map((r) => r.reply), input.turns.map((t) => t.turn))) return `score each agent reply exactly once: replies ${input.turns.map((t) => t.turn).join(", ")}`;
  if (!sameSet(out.checks.map((c) => c.id), input.checks.map((c) => c.id))) return `answer exactly these checks: ${input.checks.map((c) => c.id).join(", ") || "none"}`;
  if (!sameSet(out.scriptFit.map((c) => c.id), input.scriptFit.map((c) => c.id))) return `answer exactly these script-fit ids: ${input.scriptFit.map((c) => c.id).join(", ") || "none"}`;
  return null;
}

/**
 * Gemma 4 writes a <thought>...</thought> block before its JSON even in JSON mode
 * (seen in the first real call, 2026-09-30). Braces inside the thoughts would
 * confuse the JSON extraction, so thought blocks are removed first.
 */
export function stripThoughts(raw: string): string {
  return raw.replace(/<thought>[\s\S]*?<\/thought>/gi, "").replace(/^[\s\S]*?<\/thought>/i, "").trim();
}

export type JudgeCall = { response: ChatResponse; raw: string | null; error?: string };

export type JudgeResult =
  | { ok: true; rubric: string; output: JudgeOutput; answers: Record<string, boolean>; calls: JudgeCall[] }
  | { ok: false; rubric: string; error: string; calls: JudgeCall[] };

/** Calls the judge; on invalid output, retries once with the problem, then gives up (the case is marked judge_failed). */
export async function runJudge(provider: ChatProvider, input: JudgeInput): Promise<JudgeResult> {
  const rubric = promptId(JUDGE_RUBRIC);
  const messages: ChatMessage[] = [
    { role: "system", content: JUDGE_RUBRIC.text },
    { role: "user", content: renderJudgeInput(input) },
  ];
  const calls: JudgeCall[] = [];
  let error = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await provider.chat({ messages, responseFormat: "json" });
    const raw = response.message.content;
    try {
      const output = JudgeOutput.parse(extractJson(stripThoughts(raw ?? "")));
      const missing = completeness(input, output);
      if (missing) throw new Error(missing);
      calls.push({ response, raw });
      const answers = Object.fromEntries([...output.checks, ...output.scriptFit].map((a) => [a.id, a.answer]));
      return { ok: true, rubric, output, answers, calls };
    } catch (e) {
      error = e instanceof z.ZodError ? z.prettifyError(e) : (e as Error).message;
      calls.push({ response, raw, error });
      messages.push({ role: "assistant", content: raw ?? "" }, { role: "user", content: `That output was invalid: ${error}. Reply again with only the corrected JSON object.` });
    }
  }
  return { ok: false, rubric, error, calls };
}
