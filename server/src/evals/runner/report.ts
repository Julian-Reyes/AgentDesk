import type { RunOutcome } from "../../tracing/tracer.ts";
import { emptyHealth, mergeHealth, toolCallHealth, type ToolCallHealth } from "../../tracing/tool-call-health.ts";
import { finalizeGrade } from "../grading/grade.ts";
import { pairsFromOutputs, renderReport as renderAgreement, report as agreementReport, wilson } from "../judge/agreement.ts";
import type { JudgedConversation } from "../judge/sample.ts";
import type { ConversationRecord, JudgeRecord } from "./store.ts";

/**
 * Metrics per agent model from a run's saved conversations (and judge results,
 * if the judge ran). Every number here comes from those files.
 */

export type FinalStatus = "pass" | "fail" | "script_mismatch" | "judge_pending" | "judge_failed" | "provider_error";

export type ConversationResult = { record: ConversationRecord; judge: JudgeRecord | null; status: FinalStatus };

export function statusOf(record: ConversationRecord, judge: JudgeRecord | null): FinalStatus {
  if (record.providerError) return "provider_error";
  const needsJudge = record.grade.judgeQuestions.length > 0;
  const final = finalizeGrade(record.grade, judge?.ok ? (judge.answers ?? {}) : {});
  if (final.status === "pending_judge") return judge && !judge.ok && needsJudge ? "judge_failed" : "judge_pending";
  return final.status;
}

type Rate = { k: number; n: number; rate: number; ci: [number, number] };
const rate = (k: number, n: number): Rate => ({ k, n, rate: n ? k / n : 0, ci: wilson(k, n) });

export type Mean = { mean: number; ci: [number, number]; n: number };
/** Quality scores are 1–5 (docs/JUDGE_RUBRIC.md). */
const SCORE_RANGE: [number, number] = [1, 5];
/**
 * Mean with a 95% normal-approximation interval, clipped to the score range:
 * near the top of the scale (e.g. 4.96 ± 0.07) the plain interval ran past 5,
 * which no mean can reach. Clipping removes only the impossible part.
 */
export function mean(xs: number[], [lo, hi]: [number, number] = SCORE_RANGE): Mean | null {
  if (xs.length === 0) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) : 0;
  const half = (1.96 * sd) / Math.sqrt(xs.length);
  return { mean: m, ci: [Math.max(lo, m - half), Math.min(hi, m + half)], n: xs.length };
}

/** Nearest-rank percentile. */
export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

export type ModelReport = {
  model: string;
  conversations: number;
  statuses: Record<FinalStatus, number>;
  /** pass / (pass + fail): script mismatches, pending/failed judging and provider errors are left out. */
  taskSuccess: Rate;
  /** Code checks only (no judge), over every conversation without a provider error. */
  codePass: Rate;
  routing: Rate;
  byAgent: Record<string, Rate>;
  policyViolations: number;
  groundingViolations: number;
  conversationsWithGrounding: Rate;
  forbiddenAttempts: number;
  escalation: Rate;
  avgModelCalls: number;
  avgToolCalls: number;
  turnLatencyMs: { p50: number | null; p95: number | null };
  callLatencyMs: { p50: number | null; p95: number | null };
  cachedCalls: number;
  tokens: { input: number; output: number };
  costUsd: number;
  health: ToolCallHealth;
  quality: { tone: Mean | null; clarity: Mean | null; helpfulness: Mean | null; lowShare: Rate } | null;
  topFailures: { check: string; count: number; cases: string[] }[];
  /** Per role, computed like the Agents page's live numbers (agents/live-metrics.ts), from these eval conversations. */
  roleStats: Record<EvalRole, RoleStats | null>;
};

export type EvalRole = "router" | "shopping" | "support";
/**
 * A role's record in these conversations, with the live table's meaning:
 * conversations in which the role made at least one model call, their
 * outcomes, and the role's own calls (latency per call; tokens; cost of
 * uncached calls). So a retired model that only ran in evals (Qwen in
 * shopping) has the same figures as a live one (Julian, 2026-10-06).
 */
export type RoleStats = {
  conversations: number;
  outcomes: Record<RunOutcome, number>;
  /** failed ÷ conversations; null with none. */
  failureRate: number | null;
  calls: number;
  latencyMs: { p50: number | null; p95: number | null };
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
};

const isRoleCall = (role: EvalRole, s: { kind: string; agent?: string }) => (role === "router" ? s.kind === "router" && s.agent === "router" : s.kind === "model_call" && s.agent === role);

export function roleStats(role: EvalRole, results: ConversationResult[]): RoleStats | null {
  const mine = results.map((r) => ({ outcome: r.record.observation.outcome, calls: r.record.observation.steps.filter((s) => isRoleCall(role, s)) })).filter((x) => x.calls.length > 0);
  if (mine.length === 0) return null;
  const outcomes: Record<RunOutcome, number> = { resolved: 0, approval_needed: 0, escalated: 0, failed: 0 };
  for (const m of mine) outcomes[m.outcome] += 1;
  const calls = mine.flatMap((m) => m.calls);
  const latencies = calls.map((s) => s.latencyMs ?? 0);
  return {
    conversations: mine.length,
    outcomes,
    failureRate: outcomes.failed / mine.length,
    calls: calls.length,
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    inputTokens: calls.reduce((n, s) => n + (s.inputTokens ?? 0), 0),
    outputTokens: calls.reduce((n, s) => n + (s.outputTokens ?? 0), 0),
    costMicros: calls.filter((s) => !s.cached).reduce((n, s) => n + (s.costMicros ?? 0), 0),
  };
}

const agentGroup = (r: ConversationRecord) => {
  const route = Array.isArray(r.case.expect.route) ? r.case.expect.route[0]! : r.case.expect.route;
  return route === "shopping" || route === "support" ? route : "router";
};

/** A failed check's family, so "reply1:mentions:0" and "reply2:mentions:1" count together. */
const family = (id: string, reason?: string) => (reason ? `${id.split(":")[0]} (${reason.split(":")[0]})` : id.replace(/^reply\d+/, "reply").split(":").slice(0, 2).join(":"));

export function modelReport(model: string, results: ConversationResult[]): ModelReport {
  const valid = results.filter((r) => r.status !== "provider_error");
  const statuses = { pass: 0, fail: 0, script_mismatch: 0, judge_pending: 0, judge_failed: 0, provider_error: 0 } as Record<FinalStatus, number>;
  for (const r of results) statuses[r.status] += 1;
  const count = (f: (r: ConversationResult) => boolean) => valid.filter(f).length;
  const check = (r: ConversationResult, id: string) => r.record.grade.checks.find((c) => c.id === id);

  const byAgent: Record<string, Rate> = {};
  for (const g of ["router", "shopping", "support"]) {
    const rs = valid.filter((r) => agentGroup(r.record) === g && (r.status === "pass" || r.status === "fail"));
    if (rs.length) byAgent[g] = rate(rs.filter((r) => r.status === "pass").length, rs.length);
  }

  const callLatencies = valid.flatMap((r) => r.record.observation.steps.filter((s) => s.kind === "model_call" || s.kind === "router").map((s) => s.latencyMs ?? 0));
  const turnLatencies = valid.flatMap((r) => r.record.stats.turnLatencyMs);

  const scores = results.flatMap((r) => (r.judge?.ok ? r.judge.output!.replies : []));
  const quality = scores.length
    ? {
        tone: mean(scores.map((s) => s.tone)),
        clarity: mean(scores.map((s) => s.clarity)),
        helpfulness: mean(scores.map((s) => s.helpfulness)),
        lowShare: rate(scores.filter((s) => Math.min(s.tone, s.clarity, s.helpfulness) <= 2).length, scores.length),
      }
    : null;

  const failures = new Map<string, Set<string>>();
  for (const r of valid) {
    for (const c of r.record.grade.checks.filter((x) => !x.pass)) {
      const f = family(c.id, c.reason);
      failures.set(f, (failures.get(f) ?? new Set()).add(r.record.caseId));
    }
    for (const [id, answer] of r.judge?.ok ? Object.entries(r.judge.answers ?? {}) : []) {
      if (answer !== false) continue;
      // Global checks by name; a case's own checks ("judge:0") and script fit grouped.
      const name = id === "judge:followup" ? "judge: promised a follow-up it can't do" : id === "judge:timing" ? "judge: unsupported timing claim" : id.startsWith("script:") ? "judge: script mismatch" : "judge: case check failed";
      failures.set(name, (failures.get(name) ?? new Set()).add(r.record.caseId));
    }
  }

  const health = mergeHealth(valid.map((r) => toolCallHealth(r.record.observation.steps)));
  // Sum every model id seen in these traces (normally just this one model, for all three roles).
  const totalHealth = mergeHealth(Object.values(health).map((h) => ({ all: h }))).all ?? emptyHealth();

  return {
    model,
    conversations: results.length,
    statuses,
    taskSuccess: rate(statuses.pass, statuses.pass + statuses.fail),
    codePass: rate(count((r) => r.record.grade.codeStatus === "pass"), valid.length),
    routing: rate(count((r) => check(r, "route")?.pass === true), valid.length),
    byAgent,
    policyViolations: valid.reduce((n, r) => n + r.record.grade.counts.policyViolations, 0),
    groundingViolations: valid.reduce((n, r) => n + r.record.grade.counts.groundingViolations, 0),
    conversationsWithGrounding: rate(count((r) => r.record.grade.counts.groundingViolations > 0), valid.length),
    forbiddenAttempts: valid.reduce((n, r) => n + r.record.grade.counts.forbiddenAttempts, 0),
    escalation: rate(count((r) => r.record.observation.effects.escalations > 0), valid.length),
    avgModelCalls: valid.length ? valid.reduce((n, r) => n + r.record.stats.modelCalls, 0) / valid.length : 0,
    avgToolCalls: valid.length ? valid.reduce((n, r) => n + r.record.stats.toolCalls, 0) / valid.length : 0,
    turnLatencyMs: { p50: percentile(turnLatencies, 50), p95: percentile(turnLatencies, 95) },
    callLatencyMs: { p50: percentile(callLatencies, 50), p95: percentile(callLatencies, 95) },
    cachedCalls: valid.reduce((n, r) => n + r.record.stats.cachedCalls, 0),
    tokens: { input: valid.reduce((n, r) => n + r.record.stats.inputTokens, 0), output: valid.reduce((n, r) => n + r.record.stats.outputTokens, 0) },
    costUsd: valid.reduce((n, r) => n + r.record.stats.costMicros, 0) / 1e6,
    health: totalHealth,
    quality,
    roleStats: { router: roleStats("router", results), shopping: roleStats("shopping", results), support: roleStats("support", results) },
    topFailures: [...failures].map(([check, cases]) => ({ check, count: cases.size, cases: [...cases].sort() })).sort((a, b) => b.count - a.count || a.check.localeCompare(b.check)),
  };
}

export function buildResults(records: ConversationRecord[], judgeFor: (r: ConversationRecord) => JudgeRecord | null): ConversationResult[] {
  return records.map((record) => {
    const judge = judgeFor(record);
    return { record, judge, status: statusOf(record, judge) };
  });
}

/** For Julian's grading sample: every conversation the judge scored. */
export function judgedConversations(results: ConversationResult[]): JudgedConversation[] {
  return results.flatMap((r) =>
    r.judge?.ok
      ? [{ runId: r.record.observation.runId, caseId: r.record.caseId, agentModel: r.record.agentModel, input: r.judge.input, judge: { model: r.judge.judgeModel, rubric: r.judge.rubric, output: r.judge.output! } }]
      : [],
  );
}

// ---- Rendering ----

const pct = (r: Rate) => (r.n ? `${Math.round(r.rate * 100)}% (${r.k}/${r.n}, ${Math.round(r.ci[0] * 100)}–${Math.round(r.ci[1] * 100)}%)` : "n/a");
const ms = (x: number | null) => (x === null ? "n/a" : x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x)} ms`);
const mn = (m: Mean | null | undefined) => (m ? `${m.mean.toFixed(2)} (${m.ci[0].toFixed(2)}–${m.ci[1].toFixed(2)})` : "n/a");

const STATUS_LABEL: Record<FinalStatus, string> = {
  pass: "pass",
  fail: "FAIL",
  script_mismatch: "script mismatch",
  judge_pending: "judge pending",
  judge_failed: "judge failed",
  provider_error: "provider error",
};

export function renderReport(title: string, reports: ModelReport[], results: ConversationResult[], judgeLabel: string | null, notes: string[] = []): string {
  const cols = reports.map((r) => r.model);
  const row = (label: string, f: (r: ModelReport) => string) => `| ${label} | ${reports.map(f).join(" | ")} |`;
  const out = [
    `# ${title}`,
    "",
    judgeLabel ? `Judge: ${judgeLabel}.` : "Judge: not run (`--no-judge`). Cases with judge checks or scripted follow-ups show as *judge pending* and are left out of task success.",
    "Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.",
    ...notes.flatMap((n) => ["", n]),
    "",
    `| Metric | ${cols.join(" | ")} |`,
    `| --- | ${cols.map(() => "---").join(" | ")} |`,
    row("Conversations", (r) => String(r.conversations)),
    row("Pass / fail / script mismatch", (r) => `${r.statuses.pass} / ${r.statuses.fail} / ${r.statuses.script_mismatch}`),
    row("Judge pending / judge failed / provider error", (r) => `${r.statuses.judge_pending} / ${r.statuses.judge_failed} / ${r.statuses.provider_error}`),
    row("**Task success** (pass ÷ pass+fail)", (r) => pct(r.taskSuccess)),
    row("Code checks pass (no judge)", (r) => pct(r.codePass)),
    row("Routing accuracy", (r) => pct(r.routing)),
    ...["router", "shopping", "support"].map((g) => row(`Task success: ${g} cases`, (r) => (r.byAgent[g] ? pct(r.byAgent[g]!) : "n/a"))),
    row("**Policy violations** (must be 0)", (r) => String(r.policyViolations)),
    row("**Grounding violations**", (r) => `${r.groundingViolations} (in ${pct(r.conversationsWithGrounding)} of conversations)`),
    row("Forbidden tool attempts", (r) => String(r.forbiddenAttempts)),
    row("Escalation rate", (r) => pct(r.escalation)),
    row("Avg model calls / tool calls", (r) => `${r.avgModelCalls.toFixed(1)} / ${r.avgToolCalls.toFixed(1)}`),
    row("Latency per turn p50 / p95", (r) => `${ms(r.turnLatencyMs.p50)} / ${ms(r.turnLatencyMs.p95)}`),
    row("Latency per call p50 / p95", (r) => `${ms(r.callLatencyMs.p50)} / ${ms(r.callLatencyMs.p95)}`),
    row("Tokens in / out", (r) => `${r.tokens.input.toLocaleString("en-US")} / ${r.tokens.output.toLocaleString("en-US")}`),
    row("Cached (replayed) calls", (r) => String(r.cachedCalls)),
    row("Cost", (r) => `$${r.costUsd.toFixed(2)}`),
    row("Tool-call health: rejected by provider / invalid args / unknown tool", (r) => `${r.health.rejectedByProvider} / ${r.health.invalidArgs} / ${r.health.unknownTool}`),
    row("Implicit / unwrapped replies; invalid router output", (r) => `${r.health.implicitReplies} / ${r.health.unwrappedReplies}; ${r.health.invalidRouterOutput}`),
    row("Garbled replies: held back / ended in failure message / delivered", (r) => `${r.health.garbledReplies} / ${r.health.garbledFallbacks} / ${r.health.garbledDelivered}`),
    row("Quality: tone", (r) => mn(r.quality?.tone)),
    row("Quality: clarity", (r) => mn(r.quality?.clarity)),
    row("Quality: helpfulness", (r) => mn(r.quality?.helpfulness)),
    row("Replies scoring ≤ 2 on any dimension", (r) => (r.quality ? pct(r.quality.lowShare) : "n/a")),
    "",
    "## Most common failures",
  ];
  for (const r of reports) {
    out.push("", `**${r.model}**`, "");
    if (r.topFailures.length === 0) out.push("None.");
    for (const f of r.topFailures.slice(0, 10)) out.push(`- ${f.check}: ${f.count} (${f.cases.join(", ")})`);
  }

  out.push("", "## Every case", "", `| Case | ${cols.join(" | ")} |`, `| --- | ${cols.map(() => "---").join(" | ")} |`);
  const caseIds = [...new Set(results.map((r) => r.record.caseId))];
  for (const id of caseIds) {
    const cells = cols.map((m) => {
      const r = results.find((x) => x.record.caseId === id && x.record.agentModel === m);
      if (!r) return "not run";
      const failed = r.record.grade.checks.filter((c) => !c.pass).map((c) => c.id);
      return `${STATUS_LABEL[r.status]}${failed.length && r.status !== "pass" ? `: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}` : ""}`;
    });
    out.push(`| ${id} | ${cells.join(" | ")} |`);
  }
  out.push("", ...renderContradictions(results));
  return out.join("\n");
}

/**
 * Judge answers whose reason concluded the opposite (rubric@3+): flagged for a
 * human to read, not corrected. Each line: case, agent model, question, the
 * flagged votes, and what the majority answer was.
 */
export function renderContradictions(results: ConversationResult[]): string[] {
  const lines = results.flatMap((r) => {
    const out = r.judge?.ok ? r.judge.output : undefined;
    if (!out) return [];
    return [...out.checks, ...out.scriptFit].flatMap((a) =>
      a.contradictions?.length
        ? [`- ${r.record.caseId} (${r.record.agentModel}) ${a.id}: vote${a.contradictions.length > 1 ? "s" : ""} ${a.contradictions.join(", ")} ${a.votes ? `of ${a.votes.length} ` : ""}reasoned the opposite of the answer; final answer ${a.answer ? "yes" : "no"}`]
        : [],
    );
  });
  const answered = results.reduce((n, r) => n + (r.judge?.ok ? (r.judge.output?.checks.length ?? 0) + (r.judge.output?.scriptFit.length ?? 0) : 0), 0);
  return ["## Judge answers that contradict their own reason", "", `${lines.length} of ${answered} judged questions.`, ...(lines.length ? ["", ...lines] : [])];
}

/**
 * Two judges on the same conversations of one run (both verdicts valid): does
 * swapping the judge change what the report says? Shows how many final
 * statuses flip (and which), who says "no" more often on the yes/no questions,
 * and score agreement per agent model. "Main" is the judge the report uses.
 */
export function renderJudgeComparison(main: string, other: string, both: { record: ConversationRecord; main: JudgeRecord; other: JudgeRecord }[]): string {
  const out = [`## Judge comparison: ${main} (main) vs ${other}`, ""];
  if (both.length === 0) return [...out, "No conversation has a valid verdict from both judges."].join("\n");
  const flips = both
    .map((b) => ({ b, s1: statusOf(b.record, b.main), s2: statusOf(b.record, b.other) }))
    .filter((f) => f.s1 !== f.s2);
  let mainNo = 0;
  let otherNo = 0;
  const disagreements: string[] = [];
  for (const b of both) {
    for (const [id, a1] of Object.entries(b.main.answers ?? {})) {
      const a2 = b.other.answers?.[id];
      if (a2 === undefined || a2 === a1) continue;
      if (a1) otherNo += 1;
      else mainNo += 1;
      disagreements.push(`${b.record.caseId} (${b.record.agentModel}) ${id}: ${main} ${a1 ? "yes" : "no"}, ${other} ${a2 ? "yes" : "no"}`);
    }
  }
  const same = rate(both.length - flips.length, both.length);
  out.push(
    `${both.length} conversations have a valid verdict from both judges (same rubric, same questions).`,
    "",
    `- **Same final status:** ${pct(same)}.`,
    ...flips.map((f) => `  - ${f.b.record.caseId} (${f.b.record.agentModel}): ${STATUS_LABEL[f.s1]} with ${main}, ${STATUS_LABEL[f.s2]} with ${other}`),
    `- **Yes/no disagreements:** ${disagreements.length}. ${main} said no where ${other} said yes: ${mainNo}; the reverse: ${otherNo}.`,
    ...disagreements.map((d) => `  - ${d}`),
    "",
    renderAgreement(`Scores and yes/no answers (first = ${main}, second = ${other})`, agreementReport(pairsFromOutputs(both.map((b) => ({ agentModel: b.record.agentModel, a: b.main.output!, b: b.other.output! }))))),
  );
  return out.join("\n");
}

/**
 * Notes for a run's report about each model's provider tier, for models whose
 * tier has changed (tierChanges in models.json). Latency depends on the tier,
 * so a run on one tier isn't comparable with a run on another. Runs from
 * before tiers were recorded are inferred from when the model's conversations
 * actually ran (`span`: the run's start and the model's last finished
 * conversation): all before the change means the old tier; a run that spans
 * the change is "unknown", never guessed.
 */
export function tierNotes(
  models: string[],
  manifest: { createdAt?: string; tiers?: Record<string, string> } | null,
  configFor: (model: string) => { tier?: string; tierChanges?: { on: string; from: string; to: string }[] } | undefined,
  lastFinished: Record<string, string | undefined> = {},
): { notes: string[]; tiers: Record<string, string> } {
  const notes: string[] = [];
  const tiers: Record<string, string> = {};
  for (const m of models) {
    const recorded = manifest?.tiers?.[m];
    if (recorded) tiers[m] = recorded;
    const last = configFor(m)?.tierChanges?.at(-1);
    if (!last) continue;
    // A date alone means "some time that day", so a run touching that day can't be placed; an exact time can.
    const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(last.on);
    const from = Date.parse(last.on);
    const to = dayOnly ? from + 86_400_000 : from;
    const when = dayOnly ? last.on : `${new Date(from).toISOString().slice(0, 16).replace("T", " ")} UTC`;
    const start = manifest?.createdAt ? Date.parse(manifest.createdAt) : NaN;
    const end = lastFinished[m] ? Date.parse(lastFinished[m]!) : start;
    if (recorded?.includes("→")) {
      notes.push(`**${m}: the tier changed during this run (${recorded}).** Its latency mixes both tiers and isn't comparable with other runs.`);
    } else if (recorded) {
      const other = recorded === last.to ? last.from : last.to;
      notes.push(`**${m} ran on the ${recorded} tier.** Its latency isn't comparable with its ${other}-tier runs (${other === last.from ? "before" : "from"} ${when}).`);
    } else if (end < from) {
      tiers[m] = `${last.from} (inferred: ran before ${when})`;
      notes.push(`**${m} ran on the ${last.from} tier** (before ${when}; not recorded in this run). Its latency isn't comparable with its ${last.to}-tier runs (from ${when}).`);
    } else if (start >= to) {
      tiers[m] = `${last.to} (inferred: ran from ${when})`;
      notes.push(`**${m} ran on the ${last.to} tier** (from ${when}; not recorded in this run). Its latency isn't comparable with its ${last.from}-tier runs (before ${when}).`);
    } else {
      tiers[m] = "unknown";
      notes.push(`**${m}: tier not recorded.** It switched from ${last.from} to ${last.to} on ${when}${dayOnly ? " (time not recorded)" : ""}, while this run was in progress, so it may have run on either. Its latency isn't comparable with other runs.`);
    }
  }
  return { notes, tiers };
}
