import { buildSeedData } from "../../seed/data.ts";
import { ALL_TOOLS } from "../../tools/registry.ts";
import { toolCallHealth, mergeHealth } from "../../tracing/tool-call-health.ts";
import { wilson } from "../judge/agreement.ts";
import { buildResults, type ConversationResult, type FinalStatus } from "./report.ts";
import { judgeFor, regrade } from "./stages.ts";
import type { RunStore } from "./store.ts";

/**
 * Compares saved runs side by side, per agent model, for a tuning round
 * (e.g. dev-1 → dev-1b → dev-2). Everything is rebuilt from the saved files
 * with the current grader and one judge's verdicts, so the runs are compared
 * on equal terms and no model is called.
 *
 * Besides task success and policy violations, it tracks the dev-1 grading
 * findings:
 *  - timing / follow-up: the judge's global checks (conversations answered "no")
 *  - internal-step leaks: a PHRASE SCAN of agent replies (no check existed). It
 *    looks for tool names, "tool"/"function call", "retry", "my earlier attempts",
 *    "mixed up". It misses paraphrases; every hit is listed so it can be read.
 *  - garbled replies: held back, ended in the failure message, delivered
 *  - emojis, and the customer's full name in a reply
 *  - judge answers that contradict their own reason (rubric@3)
 */

const TOOL_NAMES = ALL_TOOLS.map((t) => t.name);
const LEAK_PATTERNS: RegExp[] = [
  new RegExp(`\\b(${TOOL_NAMES.join("|")})\\b`),
  /\b(tool|tools|function call|tool call)\b/i,
  /\bre-?tr(y|ied|ying)\b/i,
  /\b(my|an?|the) (earlier|previous|first|last|initial) (attempts?|tries|try|lookup|search|call)\b/i,
  /\bmixed up\b/i,
];
const EMOJI = /\p{Extended_Pictographic}/u;

export type RunModelSummary = {
  statuses: Record<FinalStatus, number>;
  taskSuccess: { k: number; n: number; ci: [number, number] };
  policyViolations: number;
  /** Conversations with a valid verdict, and those where the judge said "no" to each global check. */
  judged: number;
  timing: string[];
  followup: string[];
  leaks: { caseId: string; text: string }[];
  garbled: { heldBack: number; fallbacks: number; delivered: number };
  emojiReplies: string[];
  fullNameReplies: string[];
  contradictions: { flagged: number; questions: number; where: string[] };
  /** Per case: the final status, for listing what changed between runs. */
  byCase: Record<string, FinalStatus>;
};

const excerpt = (text: string, m: RegExpExecArray) => {
  const from = Math.max(0, m.index - 40);
  return `${from > 0 ? "…" : ""}${text.slice(from, m.index + m[0].length + 40).replace(/\s+/g, " ")}…`;
};

export function summarizeRun(store: RunStore, judge: { model: string; rubric: string }): Record<string, RunModelSummary> {
  const names = new Map(buildSeedData().customers.map((c) => [c.email, c.name]));
  const results = buildResults(regrade(store.conversations()), (r) => judgeFor(store, judge.model, judge.rubric, r));
  const models = [...new Set(results.map((r) => r.record.agentModel))].sort();
  return Object.fromEntries(models.map((m) => [m, summarize(results.filter((r) => r.record.agentModel === m), names)]));
}

function summarize(results: ConversationResult[], names: Map<string, string>): RunModelSummary {
  const statuses = { pass: 0, fail: 0, script_mismatch: 0, judge_pending: 0, judge_failed: 0, provider_error: 0 } as Record<FinalStatus, number>;
  for (const r of results) statuses[r.status] += 1;
  const n = statuses.pass + statuses.fail;
  const s: RunModelSummary = {
    statuses,
    taskSuccess: { k: statuses.pass, n, ci: wilson(statuses.pass, n) },
    policyViolations: results.reduce((k, r) => k + r.record.grade.counts.policyViolations, 0),
    judged: results.filter((r) => r.judge?.ok).length,
    timing: [],
    followup: [],
    leaks: [],
    garbled: { heldBack: 0, fallbacks: 0, delivered: 0 },
    emojiReplies: [],
    fullNameReplies: [],
    contradictions: { flagged: 0, questions: 0, where: [] },
    byCase: {},
  };
  // Every model id in these traces (normally this one model, in all three roles).
  for (const h of Object.values(mergeHealth(results.map((r) => toolCallHealth(r.record.observation.steps))))) {
    s.garbled.heldBack += h.garbledReplies;
    s.garbled.fallbacks += h.garbledFallbacks;
    s.garbled.delivered += h.garbledDelivered;
  }

  for (const r of results) {
    const id = r.record.caseId;
    s.byCase[id] = r.status;
    const answers = r.judge?.ok ? (r.judge.answers ?? {}) : {};
    if (answers["judge:timing"] === false) s.timing.push(id);
    if (answers["judge:followup"] === false) s.followup.push(id);
    const out = r.judge?.ok ? r.judge.output : undefined;
    for (const a of out ? [...out.checks, ...out.scriptFit] : []) {
      s.contradictions.questions += 1;
      if (a.contradictions?.length) {
        s.contradictions.flagged += 1;
        s.contradictions.where.push(`${id} ${a.id}`);
      }
    }
    const fullName = r.record.case.customer ? names.get(r.record.case.customer) : undefined;
    const replies = r.record.observation.steps.filter((x) => x.kind === "reply" && x.agent !== "router").map((x) => String((x.data as { message: string }).message));
    for (const text of replies) {
      for (const p of LEAK_PATTERNS) {
        const m = p.exec(text);
        if (m) {
          s.leaks.push({ caseId: id, text: excerpt(text, m) });
          break;
        }
      }
      if (EMOJI.test(text)) s.emojiReplies.push(id);
      if (fullName && text.toLowerCase().includes(fullName.toLowerCase())) s.fullNameReplies.push(id);
    }
  }
  return s;
}

const pct = (k: number, n: number) => (n ? `${Math.round((k / n) * 100)}%` : "n/a");
const pc = (x: number) => `${Math.round(x * 100)}%`;
const ids = (xs: string[]) => (xs.length ? ` (${[...new Set(xs)].join(", ")})` : "");

/** Markdown: one table per agent model (runs as columns), then what changed per case between consecutive runs. */
export function renderComparison(runs: { name: string; summary: Record<string, RunModelSummary> }[], judgeLabel: string): string {
  const models = [...new Set(runs.flatMap((r) => Object.keys(r.summary)))].sort();
  const out = [`# Run comparison: ${runs.map((r) => r.name).join(" → ")}`, "", `Judge: ${judgeLabel}, for every run. Rebuilt from the saved files with the current grader; no model calls.`, ""];
  for (const m of models) {
    const cols = runs.map((r) => r.summary[m]);
    const row = (label: string, f: (s: RunModelSummary) => string) => `| ${label} | ${cols.map((s) => (s ? f(s) : "not run")).join(" | ")} |`;
    out.push(
      `## ${m}`,
      "",
      `| | ${runs.map((r) => r.name).join(" | ")} |`,
      `| --- | ${runs.map(() => "---").join(" | ")} |`,
      row("Pass / fail / script mismatch", (s) => `${s.statuses.pass} / ${s.statuses.fail} / ${s.statuses.script_mismatch}`),
      row("**Task success**", (s) => `**${pct(s.taskSuccess.k, s.taskSuccess.n)}** (${s.taskSuccess.k}/${s.taskSuccess.n}, ${pc(s.taskSuccess.ci[0])}–${pc(s.taskSuccess.ci[1])})`),
      row("Policy violations", (s) => String(s.policyViolations)),
      row("Unsupported timing (judge)", (s) => `${s.timing.length} of ${s.judged}`),
      row("Follow-up promises (judge)", (s) => `${s.followup.length} of ${s.judged}`),
      row("Internal-step leaks (phrase scan)", (s) => String(s.leaks.length)),
      row("Garbled: held back / failure msg / delivered", (s) => `${s.garbled.heldBack} / ${s.garbled.fallbacks} / ${s.garbled.delivered}`),
      row("Replies with emojis / the full name", (s) => `${s.emojiReplies.length} / ${s.fullNameReplies.length}`),
      row("Judge answers contradicting their reason", (s) => `${s.contradictions.flagged} of ${s.contradictions.questions}`),
      "",
    );
    for (const [i, s] of cols.entries()) {
      if (!s) continue;
      const detail = [
        s.timing.length ? `timing${ids(s.timing)}` : "",
        s.followup.length ? `follow-up${ids(s.followup)}` : "",
        s.contradictions.flagged ? `contradictions (${s.contradictions.where.join("; ")})` : "",
        s.emojiReplies.length ? `emojis${ids(s.emojiReplies)}` : "",
        s.fullNameReplies.length ? `full name${ids(s.fullNameReplies)}` : "",
      ].filter(Boolean);
      if (detail.length || s.leaks.length) {
        out.push(`**${runs[i]!.name}:** ${detail.join("; ") || "—"}`);
        for (const l of s.leaks) out.push(`- leak? ${l.caseId}: "${l.text}"`);
        out.push("");
      }
    }
    for (let i = 1; i < runs.length; i++) {
      const a = runs[i - 1]!.summary[m];
      const b = runs[i]!.summary[m];
      if (!a || !b) continue;
      const flips = Object.keys(b.byCase)
        .filter((c) => a.byCase[c] && a.byCase[c] !== b.byCase[c])
        .map((c) => `${c} ${a.byCase[c]} → ${b.byCase[c]}`);
      out.push(`**${runs[i - 1]!.name} → ${runs[i]!.name}, cases that changed:** ${flips.length ? flips.join("; ") : "none"}`, "");
    }
  }
  return out.join("\n");
}
