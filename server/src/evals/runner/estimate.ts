import type { ModelConfig } from "../../llm/config.ts";
import type { EvalCase } from "../case-schema.ts";

/**
 * The preflight estimate: before a real run, how many calls and tokens each
 * model will need and how long its limits make that take, so the bottleneck
 * is visible before anything is spent. Models run in parallel (separate
 * quotas), then the judge runs.
 *
 * Per-conversation figures come from measurements (docs/FREE_TIERS.md, M2 smoke
 * tests and chats, 2026-09-29), and are replaced by the run's own averages once
 * a model has at least MIN_MEASURED finished conversations. Retries after
 * garbled tool calls aren't included, and cached calls cost nothing, so treat
 * the numbers as a rough guide, not a promise.
 */

export type ConversationCost = { calls: number; inputTokens: number; outputTokens: number; latencyMs: number };

type Profile = {
  routerInputTokens: number;
  agentInputTokens: number;
  /** Later turns carry the conversation so far: ~2,550 vs ~1,600 tokens on gpt-oss-120b. */
  laterTurnFactor: number;
  agentCallsPerTurn: number;
  outputTokensPerCall: number;
  /** How many tokens this model's tokenizer counts for the same text, relative to gpt-oss. */
  tokenFactor: number;
  latencyMsPerCall: number;
  source: string;
};

const BASE: Profile = {
  routerInputTokens: 420, // gpt-oss-120b router call
  agentInputTokens: 1600, // gpt-oss-120b agent steps: 1,260-1,800
  laterTurnFactor: 1.6,
  agentCallsPerTurn: 3.5, // 4-6 calls per one-turn conversation, including the router
  outputTokensPerCall: 150, // not measured; tool calls and short replies
  tokenFactor: 1,
  latencyMsPerCall: 1500,
  source: "default",
};

const MEASURED: Record<string, Partial<Profile>> = {
  "groq/gpt-oss-120b": { latencyMsPerCall: 600, source: "M2 measurements (p50 0.6 s)" },
  "groq/qwen3.8-27b": { tokenFactor: 1.5, latencyMsPerCall: 700, source: "M2 measurements (~50% more tokens, p50 0.7 s)" },
  // Tokens: Gemini 3.8 Flash's first agent step was ~1,840 vs ~1,400 on gpt-oss; assumed the same tokenizer for Flash-Lite.
  "gemini/gemini-3.5-flash-lite": { tokenFactor: 1.3, latencyMsPerCall: 13000, source: "M2 measurements (p50 13 s; tokens from 3.8 Flash)" },
};

/** One judge call per conversation (measured once on Gemma 4 31B: 1,115 in / 248 out, 62.6 s; real tool summaries run longer). */
/**
 * Per judged conversation, rubric@2: 1 scoring call + one call per question, with
 * the follow-up and timing checks asked 3 times. On dev-1 a conversation has 2.7
 * questions on average (2 of them voted), so ~7.7 calls. Tokens are scaled from
 * gpt-oss-20b's rubric@1 calls on dev-1 (1,733 in / 714 out per call, reasoning
 * included); question calls carry a shorter system prompt and a one-line answer.
 * The calls run in parallel, so latency stays about one call's (Gemma: 62.6 s).
 */
export const JUDGE_CALL: ConversationCost = { calls: 8, inputTokens: 9300, outputTokens: 1900, latencyMs: 62600 };
const JUDGE_MEASURED: Record<string, Partial<ConversationCost>> = {
  "groq/gpt-oss-20b": { latencyMs: 2500 },
};

export const MIN_MEASURED = 5;

const routerOnly = (c: EvalCase) => {
  const routes = Array.isArray(c.expect.route) ? c.expect.route : [c.expect.route];
  return routes.every((r) => r === "out_of_scope" || r === "clarify");
};

/** Expected cost of one conversation from the case's shape (turns, router-only or not) and the model's profile. */
export function caseCost(c: EvalCase, modelId: string): ConversationCost & { source: string } {
  const p = { ...BASE, ...MEASURED[modelId] };
  if (routerOnly(c)) {
    const calls = c.turns.length;
    return { calls, inputTokens: Math.round(calls * p.routerInputTokens * p.tokenFactor), outputTokens: calls * 80, latencyMs: calls * p.latencyMsPerCall, source: p.source };
  }
  let input = p.routerInputTokens;
  c.turns.forEach((_, i) => (input += p.agentCallsPerTurn * p.agentInputTokens * (i === 0 ? 1 : p.laterTurnFactor)));
  const calls = 1 + c.turns.length * p.agentCallsPerTurn;
  return { calls, inputTokens: Math.round(input * p.tokenFactor), outputTokens: Math.round(calls * p.outputTokensPerCall), latencyMs: calls * p.latencyMsPerCall, source: p.source };
}

export type ModelEstimate = {
  model: string;
  role: "agents" | "judge";
  conversations: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  source: string;
  /** Minutes each per-minute constraint needs on its own. null = no limit configured. */
  minutes: { requests: number | null; tokens: number | null; latency: number };
  /** Days each daily limit needs. null = limit unknown. */
  days: { requests: number | null; tokens: number | null };
  /** At least this long while working (the slowest per-minute constraint). */
  activeMinutes: number;
  /** Calendar days needed because of daily limits (1 = fits in one day); null if unknown. */
  daysNeeded: number | null;
  bottleneck: string;
  costUsd: number;
};

export function estimateModel(
  config: ModelConfig,
  role: ModelEstimate["role"],
  costs: ConversationCost[],
  source: string,
): ModelEstimate {
  const sum = (k: keyof ConversationCost) => costs.reduce((n, x) => n + x[k], 0);
  const calls = sum("calls");
  const inputTokens = sum("inputTokens");
  const outputTokens = sum("outputTokens");
  const tokens = inputTokens + outputTokens;
  const minutes = {
    requests: config.rpm ? calls / config.rpm : null,
    tokens: config.tpm ? tokens / config.tpm : null,
    latency: sum("latencyMs") / 60000,
  };
  const days = { requests: config.rpd ? calls / config.rpd : null, tokens: config.tpd ? tokens / config.tpd : null };
  const active = Math.max(minutes.requests ?? 0, minutes.tokens ?? 0, minutes.latency);
  const knownDays = [days.requests, days.tokens].filter((d): d is number => d !== null);
  const daysNeeded = knownDays.length ? Math.max(1, Math.ceil(Math.max(...knownDays) - 1e-9)) : null;

  let bottleneck: string;
  if (daysNeeded !== null && daysNeeded > 1) {
    bottleneck = (days.tokens ?? 0) >= (days.requests ?? 0) ? `tokens/day (${config.tpd!.toLocaleString("en-US")})` : `requests/day (${config.rpd})`;
  } else {
    const which: Array<[number, string]> = [
      [minutes.requests ?? -1, `requests/min (${config.rpm})`],
      [minutes.tokens ?? -1, `tokens/min (${config.tpm?.toLocaleString("en-US")})`],
      [minutes.latency, "model speed (latency)"],
    ];
    bottleneck = which.sort((a, b) => b[0] - a[0])[0]![1];
  }
  const costUsd = (inputTokens * config.pricing.inputPerMTok + outputTokens * config.pricing.outputPerMTok) / 1e6;
  return { model: config.id, role, conversations: costs.length, calls: Math.round(calls), inputTokens, outputTokens, source, minutes, days, activeMinutes: active, daysNeeded, bottleneck, costUsd };
}

/** Agent-side estimate for one model: measured averages from finished conversations if there are enough, else the case shapes. */
export function estimateAgents(config: ModelConfig, remaining: EvalCase[], finished: ConversationCost[]): ModelEstimate {
  if (finished.length >= MIN_MEASURED) {
    const avg = (k: keyof ConversationCost) => finished.reduce((n, x) => n + x[k], 0) / finished.length;
    const per: ConversationCost = { calls: avg("calls"), inputTokens: Math.round(avg("inputTokens")), outputTokens: Math.round(avg("outputTokens")), latencyMs: avg("latencyMs") };
    return estimateModel(config, "agents", remaining.map(() => per), `this run's ${finished.length} finished conversations`);
  }
  const costs = remaining.map((c) => caseCost(c, config.id));
  return estimateModel(config, "agents", costs, costs[0]?.source ?? "default");
}

export function estimateJudge(config: ModelConfig, conversations: number): ModelEstimate {
  const per = { ...JUDGE_CALL, ...JUDGE_MEASURED[config.id] };
  return estimateModel(config, "judge", Array.from({ length: conversations }, () => per), JUDGE_MEASURED[config.id] ? "estimate" : "one measured Gemma call");
}

const dur = (min: number) => (min < 1 ? `${Math.round(min * 60)} s` : min < 90 ? `${Math.round(min)} min` : `${(min / 60).toFixed(1)} h`);
const k = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}K` : n.toLocaleString("en-US"));

export function renderEstimate(estimates: ModelEstimate[]): string {
  const rows = estimates.map((e) => {
    const perMin = [e.minutes.requests !== null ? `${dur(e.minutes.requests)} by req/min` : null, e.minutes.tokens !== null ? `${dur(e.minutes.tokens)} by tok/min` : null, `${dur(e.minutes.latency)} by latency`]
      .filter(Boolean)
      .join("; ");
    const daily =
      e.daysNeeded === null
        ? "daily limit unknown"
        : `${e.days.requests !== null ? `${Math.round(e.days.requests * 100)}% of req/day` : ""}${e.days.requests !== null && e.days.tokens !== null ? ", " : ""}${e.days.tokens !== null ? `${Math.round(e.days.tokens * 100)}% of tok/day` : ""}${e.daysNeeded > 1 ? ` → ${e.daysNeeded} days` : ""}`;
    return `| ${e.model} (${e.role}) | ${e.conversations} | ${e.calls} | ${k(e.inputTokens)} / ${k(e.outputTokens)} | ${perMin} | ${daily} | **${e.daysNeeded && e.daysNeeded > 1 ? `${e.daysNeeded} days` : dur(e.activeMinutes)}** | ${e.bottleneck} | $${e.costUsd.toFixed(2)} |`;
  });
  const agents = estimates.filter((e) => e.role === "agents");
  const judge = estimates.filter((e) => e.role === "judge");
  const wall = (es: ModelEstimate[]) => Math.max(0, ...es.map((e) => (e.daysNeeded && e.daysNeeded > 1 ? (e.daysNeeded - 1) * 1440 + e.activeMinutes : e.activeMinutes)));
  const unknownDaily = estimates.filter((e) => e.daysNeeded === null).map((e) => e.model);
  return [
    "| Model | Conversations | Calls | Tokens in / out | Time by each per-minute limit | Daily limits | Time needed | Bottleneck | Cost |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `Agents run in parallel (one worker per model, separate quotas): about ${dur(wall(agents))}${judge.length ? `; then the judge: about ${dur(wall(judge))}` : ""}.`,
    `Sources: ${[...new Set(estimates.map((e) => `${e.model}: ${e.source}`))].join("; ")}. Retries after garbled tool calls aren't included; cached calls are free and instant.`,
    ...(unknownDaily.length ? [`Daily limit unknown for ${unknownDaily.join(", ")}: a daily-quota error stops that model cleanly, and the run resumes where it stopped.`] : []),
  ].join("\n");
}
