import { buildSeedData } from "../../seed/data.ts";
import { ALL_TOOLS } from "../../tools/registry.ts";
import { MODEL_OUTPUT_ERROR_CODES } from "../../llm/openai-compatible.ts";
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

/**
 * The reply uses the customer's full name other than to say which account is
 * signed in (Julian, 2026-10-01: that's fine; addressing them by it isn't).
 * A heuristic: "signed in as Maya Chen" and "Maya Chen's account" don't count.
 */
export function addressesByFullName(text: string, fullName: string): boolean {
  const name = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const m of text.matchAll(new RegExp(name, "gi"))) {
    const before = text.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 10).toLowerCase();
    if (/(signed in as|logged in as|account (of|for)|account,?|account \()\s*$/.test(before) || /^['’]s\b/.test(after) || /^\s*\(/.test(after)) continue;
    return true;
  }
  return false;
}

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
  /** uncheckable: votes whose reason stated no recognizable conclusion (rubric@4). */
  contradictions: { flagged: number; questions: number; uncheckable: number; where: string[] };
  /**
   * Model calls the provider rejected as malformed (Groq tool_use_failed and
   * similar, counting each failed attempt), reply calls rebuilt from such a
   * rejection (round 2), and conversations where a call failed every attempt,
   * so a turn ended with the failure message.
   */
  providerRejections: { rejected: number; repaired: number; ended: string[] };
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
    contradictions: { flagged: 0, questions: 0, uncheckable: 0, where: [] },
    providerRejections: { rejected: 0, repaired: 0, ended: [] },
    byCase: {},
  };
  // Every model id in these traces (normally this one model, in all three roles).
  for (const h of Object.values(mergeHealth(results.map((r) => toolCallHealth(r.record.observation.steps))))) {
    s.garbled.heldBack += h.garbledReplies;
    s.garbled.fallbacks += h.garbledFallbacks;
    s.garbled.delivered += h.garbledDelivered;
    s.providerRejections.rejected += h.rejectedByProvider;
    s.providerRejections.repaired += h.repairedReplies;
  }

  for (const r of results) {
    const id = r.record.caseId;
    s.byCase[id] = r.status;
    const endedByRejection = r.record.observation.steps.some(
      (x) => x.kind === "error" && ((x.data as { failedAttempts?: { code?: string }[] }).failedAttempts ?? []).some((a) => MODEL_OUTPUT_ERROR_CODES.has(a.code ?? "")),
    );
    if (endedByRejection) s.providerRejections.ended.push(id);
    const answers = r.judge?.ok ? (r.judge.answers ?? {}) : {};
    if (answers["judge:timing"] === false) s.timing.push(id);
    if (answers["judge:followup"] === false) s.followup.push(id);
    const out = r.judge?.ok ? r.judge.output : undefined;
    for (const a of out ? [...out.checks, ...out.scriptFit] : []) {
      s.contradictions.questions += 1;
      s.contradictions.uncheckable += a.noConclusion ?? 0;
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
      if (fullName && addressesByFullName(text, fullName)) s.fullNameReplies.push(id);
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
      row("Replies with emojis / addressing the customer by full name", (s) => `${s.emojiReplies.length} / ${s.fullNameReplies.length}`),
      row("Judge answers contradicting their reason", (s) => `${s.contradictions.flagged} of ${s.contradictions.questions}${s.contradictions.uncheckable ? ` (${s.contradictions.uncheckable} votes stated no conclusion)` : ""}`),
      row(REJECTIONS_LABEL, rejections),
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

const REJECTIONS_LABEL = "Provider-rejected calls / repaired replies / conversations ended by one";
const rejections = (s: RunModelSummary) => `${s.providerRejections.rejected} / ${s.providerRejections.repaired} / ${s.providerRejections.ended.length}`;

/**
 * Round 2: configurations run more than once. A group is one configuration
 * (e.g. prompts round-1) and its repeats (dev-3-r1a, dev-3-r1b), all on the
 * same code with the cache in refresh mode, so every repeat re-samples the models.
 */
export type RunGroup = { label: string; runs: { name: string; summary: Record<string, RunModelSummary> }[] };

/** One summary over several repeats: counts add up, task success is recomputed over all their conversations. */
export function poolSummaries(xs: RunModelSummary[]): RunModelSummary {
  const statuses = { pass: 0, fail: 0, script_mismatch: 0, judge_pending: 0, judge_failed: 0, provider_error: 0 } as Record<FinalStatus, number>;
  for (const x of xs) for (const k of Object.keys(statuses) as FinalStatus[]) statuses[k] += x.statuses[k];
  const n = statuses.pass + statuses.fail;
  const sum = (f: (x: RunModelSummary) => number) => xs.reduce((t, x) => t + f(x), 0);
  return {
    statuses,
    taskSuccess: { k: statuses.pass, n, ci: wilson(statuses.pass, n) },
    policyViolations: sum((x) => x.policyViolations),
    judged: sum((x) => x.judged),
    timing: xs.flatMap((x) => x.timing),
    followup: xs.flatMap((x) => x.followup),
    leaks: xs.flatMap((x) => x.leaks),
    garbled: { heldBack: sum((x) => x.garbled.heldBack), fallbacks: sum((x) => x.garbled.fallbacks), delivered: sum((x) => x.garbled.delivered) },
    emojiReplies: xs.flatMap((x) => x.emojiReplies),
    fullNameReplies: xs.flatMap((x) => x.fullNameReplies),
    contradictions: {
      flagged: sum((x) => x.contradictions.flagged),
      questions: sum((x) => x.contradictions.questions),
      uncheckable: sum((x) => x.contradictions.uncheckable),
      where: xs.flatMap((x) => x.contradictions.where),
    },
    providerRejections: { rejected: sum((x) => x.providerRejections.rejected), repaired: sum((x) => x.providerRejections.repaired), ended: xs.flatMap((x) => x.providerRejections.ended) },
    // Pooled runs have no single status per case; passesByCase covers that.
    byCase: {},
  };
}

/** Per case, how many of a group's repeats passed it, out of those that scored it. */
export function passesByCase(xs: RunModelSummary[]): Record<string, { pass: number; scored: number }> {
  const out: Record<string, { pass: number; scored: number }> = {};
  for (const x of xs) {
    for (const [id, status] of Object.entries(x.byCase)) {
      if (status !== "pass" && status !== "fail") continue;
      const c = (out[id] ??= { pass: 0, scored: 0 });
      c.scored += 1;
      if (status === "pass") c.pass += 1;
    }
  }
  return out;
}

const rate = (s: RunModelSummary) => (s.taskSuccess.n ? s.taskSuccess.k / s.taskSuccess.n : NaN);
const points = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))} pts`;

/** The largest gap in task success between two repeats of the same configuration (0 for a single run). */
export function repeatGap(xs: RunModelSummary[]): number {
  const rates = xs.map(rate).filter((r) => !Number.isNaN(r));
  return rates.length < 2 ? 0 : Math.max(...rates) - Math.min(...rates);
}

/**
 * Markdown for grouped runs: an overview pooled over all models, then one table
 * per model with each configuration pooled over its repeats, the repeats on
 * their own, and how far apart they are. A configuration difference no larger
 * than the repeat-to-repeat gaps is read as noise.
 */
export function renderGroupedComparison(groups: RunGroup[], judgeLabel: string): string {
  const models = [...new Set(groups.flatMap((g) => g.runs.flatMap((r) => Object.keys(r.summary))))].sort();
  const forModel = (g: RunGroup, m: string) => g.runs.map((r) => r.summary[m]).filter((x): x is RunModelSummary => !!x);
  const pooled = (g: RunGroup, m: string) => poolSummaries(forModel(g, m));
  const out = [
    `# Grouped run comparison: ${groups.map((g) => `${g.label} (${g.runs.map((r) => r.name).join(", ")})`).join(" vs ")}`,
    "",
    `Judge: ${judgeLabel}, for every run. Rebuilt from the saved files with the current grader; no model calls.`,
    "A configuration is pooled over its repeats. **Repeat gap** is the largest task-success difference between repeats of the same configuration: a difference between configurations that isn't bigger than that is noise.",
    "",
    "## Overview: task success",
    "",
    `| Model | ${groups.map((g) => g.label).join(" | ")} |`,
    `| --- | ${groups.map(() => "---").join(" | ")} |`,
  ];
  const cell = (s: RunModelSummary, gap?: number) =>
    `${pct(s.taskSuccess.k, s.taskSuccess.n)} (${s.taskSuccess.k}/${s.taskSuccess.n}, ${pc(s.taskSuccess.ci[0])}–${pc(s.taskSuccess.ci[1])})${gap !== undefined ? `; repeat gap ${Math.round(gap * 100)} pts` : ""}`;
  for (const m of models) {
    out.push(`| ${m} | ${groups.map((g) => (forModel(g, m).length ? cell(pooled(g, m), forModel(g, m).length > 1 ? repeatGap(forModel(g, m)) : undefined) : "not run")).join(" | ")} |`);
  }
  out.push(`| **All models pooled** | ${groups.map((g) => `**${cell(poolSummaries(models.map((m) => pooled(g, m))))}**`).join(" | ")} |`, "");

  for (const m of models) {
    const cols = groups.map((g) => (forModel(g, m).length ? pooled(g, m) : undefined));
    const row = (label: string, f: (s: RunModelSummary, g: RunGroup) => string) =>
      `| ${label} | ${cols.map((s, i) => (s ? f(s, groups[i]!) : "not run")).join(" | ")} |`;
    out.push(
      `## ${m}`,
      "",
      `| | ${groups.map((g) => g.label).join(" | ")} |`,
      `| --- | ${groups.map(() => "---").join(" | ")} |`,
      row("Repeats", (_s, g) => g.runs.filter((r) => r.summary[m]).map((r) => `${r.name}: ${pct(r.summary[m]!.taskSuccess.k, r.summary[m]!.taskSuccess.n)} (${r.summary[m]!.taskSuccess.k}/${r.summary[m]!.taskSuccess.n})`).join("<br>")),
      row("Repeat gap", (_s, g) => (forModel(g, m).length > 1 ? `${Math.round(repeatGap(forModel(g, m)) * 100)} pts` : "single run")),
      row("**Task success, pooled**", (s) => `**${pct(s.taskSuccess.k, s.taskSuccess.n)}** (${s.taskSuccess.k}/${s.taskSuccess.n}, ${pc(s.taskSuccess.ci[0])}–${pc(s.taskSuccess.ci[1])})`),
      row("Pass / fail / script mismatch / judge failed / provider error", (s) => `${s.statuses.pass} / ${s.statuses.fail} / ${s.statuses.script_mismatch} / ${s.statuses.judge_failed} / ${s.statuses.provider_error}`),
      row("Policy violations", (s) => String(s.policyViolations)),
      row("Unsupported timing (judge)", (s) => `${s.timing.length} of ${s.judged}`),
      row("Follow-up promises (judge)", (s) => `${s.followup.length} of ${s.judged}`),
      row("Internal-step leaks (phrase scan)", (s) => String(s.leaks.length)),
      row("Garbled: held back / failure msg / delivered", (s) => `${s.garbled.heldBack} / ${s.garbled.fallbacks} / ${s.garbled.delivered}`),
      row("Replies with emojis / addressing the customer by full name", (s) => `${s.emojiReplies.length} / ${s.fullNameReplies.length}`),
      row(REJECTIONS_LABEL, rejections),
      row("Judge answers contradicting their reason", (s) => `${s.contradictions.flagged} of ${s.contradictions.questions}${s.contradictions.uncheckable ? ` (${s.contradictions.uncheckable} stated no conclusion)` : ""}`),
      "",
    );
    for (const [i, s] of cols.entries()) {
      if (!s) continue;
      const detail = [
        s.timing.length ? `timing${ids(s.timing)}` : "",
        s.followup.length ? `follow-up${ids(s.followup)}` : "",
        s.providerRejections.ended.length ? `ended by a rejected call${ids(s.providerRejections.ended)}` : "",
        s.contradictions.flagged ? `contradictions (${s.contradictions.where.join("; ")})` : "",
        s.emojiReplies.length ? `emojis${ids(s.emojiReplies)}` : "",
        s.fullNameReplies.length ? `full name${ids(s.fullNameReplies)}` : "",
      ].filter(Boolean);
      if (detail.length || s.leaks.length) {
        out.push(`**${groups[i]!.label}:** ${detail.join("; ") || "—"}`);
        for (const l of s.leaks) out.push(`- leak? ${l.caseId}: "${l.text}"`);
        out.push("");
      }
    }
    for (let i = 1; i < groups.length; i++) {
      const [ga, gb] = [groups[i - 1]!, groups[i]!];
      const [a, b] = [cols[i - 1], cols[i]];
      if (!a || !b) continue;
      const diff = rate(b) - rate(a);
      const gaps = [forModel(ga, m), forModel(gb, m)].filter((xs) => xs.length > 1).map(repeatGap);
      const verdict = gaps.length
        ? Math.abs(diff) <= Math.max(...gaps)
          ? `no larger than the repeat gaps (${gaps.map((g) => `${Math.round(g * 100)}`).join(" and ")} pts), so it reads as noise`
          : `larger than the repeat gaps (${gaps.map((g) => `${Math.round(g * 100)}`).join(" and ")} pts)`
        : "no repeats to compare it with";
      const pa = passesByCase(forModel(ga, m));
      const pb = passesByCase(forModel(gb, m));
      const moved = Object.keys({ ...pa, ...pb })
        .sort()
        .filter((c) => pa[c] && pb[c] && pa[c]!.pass / pa[c]!.scored !== pb[c]!.pass / pb[c]!.scored)
        .map((c) => `${c} ${pa[c]!.pass}/${pa[c]!.scored} → ${pb[c]!.pass}/${pb[c]!.scored}`);
      out.push(`**${ga.label} → ${gb.label}:** ${points(diff)} task success, pooled; ${verdict}.`, "");
      out.push(`Cases passed by a different share of repeats: ${moved.length ? moved.join("; ") : "none"}`, "");
    }
  }
  return out.join("\n");
}
