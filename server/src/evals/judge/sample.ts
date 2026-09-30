import { createRng } from "../../seed/rng.ts";
import type { JudgeInput, JudgeOutput } from "./judge.ts";

/**
 * Julian's blind check of the judge: 30 replies, stratified by the agent model
 * that wrote them, shown in shuffled order with no model names and no judge
 * scores. The sample file (what Julian sees) and the key file (models, run ids,
 * judge scores) are separate; the grading tool never reads the key.
 */

/** One judged conversation, as the eval runner records it. */
export type JudgedConversation = {
  runId: string;
  caseId: string;
  /** The model config that played the agents (e.g. "groq/gpt-oss-120b"). */
  agentModel: string;
  input: JudgeInput;
  /** null when the judge failed on this conversation. */
  judge: { model: string; rubric: string; output: JudgeOutput } | null;
};

export type Scores = { tone: number; clarity: number; helpfulness: number };

/** What Julian sees: the same input the judge saw, and which reply to grade. */
export type GradingItem = { itemId: string; reply: number; input: JudgeInput };

export type JudgeVerdict = { model: string; rubric: string; scores: Scores; answers: Record<string, boolean> };

export type KeyEntry = {
  itemId: string;
  runId: string;
  caseId: string;
  agentModel: string;
  reply: number;
  judge: JudgeVerdict;
  /** The second judge's verdict on the same conversation, once it has run. */
  second?: JudgeVerdict | null;
};

export type HumanGrade = Scores & { answers: Record<string, boolean>; note?: string };

export function verdictFor(judge: { model: string; rubric: string; output: JudgeOutput }, reply: number): JudgeVerdict {
  const r = judge.output.replies.find((x) => x.reply === reply)!;
  return {
    model: judge.model,
    rubric: judge.rubric,
    scores: { tone: r.tone, clarity: r.clarity, helpfulness: r.helpfulness },
    answers: Object.fromEntries([...judge.output.checks, ...judge.output.scriptFit].map((a) => [a.id, a.answer])),
  };
}

function shuffle<T>(xs: T[], rng: ReturnType<typeof createRng>): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Picks `size` replies: round-robin across agent models (so each model gets
 * about size/models), at most one reply per conversation, then shuffles the
 * picks so the order says nothing about the model. Seeded, so reproducible.
 */
export function sampleForGrading(conversations: JudgedConversation[], size = 30, seed = 20260930): { items: GradingItem[]; key: KeyEntry[] } {
  const rng = createRng(seed);
  const byModel = new Map<string, JudgedConversation[]>();
  for (const c of conversations) {
    if (!c.judge) continue; // nothing to compare against
    byModel.set(c.agentModel, [...(byModel.get(c.agentModel) ?? []), c]);
  }
  const queues = [...byModel.keys()].sort().map((m) => shuffle(byModel.get(m)!, rng));
  const picked: JudgedConversation[] = [];
  while (picked.length < size && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && picked.length < size) picked.push(q.shift()!);
  }

  const drafts = shuffle(picked, rng).map((c) => ({ c, reply: c.input.turns[rng.int(0, c.input.turns.length - 1)]!.turn }));
  const items: GradingItem[] = [];
  const key: KeyEntry[] = [];
  drafts.forEach(({ c, reply }, i) => {
    const itemId = `G${String(i + 1).padStart(2, "0")}`;
    items.push({ itemId, reply, input: c.input });
    key.push({ itemId, runId: c.runId, caseId: c.caseId, agentModel: c.agentModel, reply, judge: verdictFor(c.judge!, reply) });
  });
  return { items, key };
}

/** The text Julian reads for one item: the same content as the judge's input, with the reply to grade marked. */
export function renderGradingItem(item: GradingItem, index: number, total: number): string {
  const i = item.input;
  const out: string[] = [`=== ${item.itemId} (${index} of ${total}): grade agent reply ${item.reply} ===`, "", "Conversation:"];
  for (const t of i.turns) {
    out.push(`  Customer ${t.turn}: ${t.customer}`);
    out.push(`${t.turn === item.reply ? "▶ " : "  "}Agent ${t.turn}: ${t.reply}`);
  }
  out.push("", "What the tools returned:", ...(i.toolSummary.length ? i.toolSummary.map((l) => `  ${l}`) : ["  (no tools were called)"]));
  if (i.judgeNote) out.push("", `What a good answer does: ${i.judgeNote}`);
  return out.join("\n");
}

/** The yes/no questions Julian answers for an item: the same judge checks and script-fit questions the judge answered. */
export function gradingQuestions(item: GradingItem): { id: string; prompt: string }[] {
  return [
    ...item.input.checks.map((c) => ({ id: c.id, prompt: `Judge check: ${c.statement}` })),
    ...item.input.scriptFit.map((s) => ({
      id: s.id,
      prompt: `Script fit: customer message ${s.turn} assumes that ${s.assumes}. Does it fit agent reply ${s.turn - 1}?`,
    })),
  ];
}

export function parseScore(input: string): number | null {
  const n = Number(input.trim());
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export function parseYesNo(input: string): boolean | null {
  const s = input.trim().toLowerCase();
  return s === "y" || s === "yes" ? true : s === "n" || s === "no" ? false : null;
}
