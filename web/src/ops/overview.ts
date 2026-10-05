import type { ComparisonSet, ModelReport, RoleView, TeamChange } from "../lib/api.ts";
import { ROLE_LABEL, describeChange, pct } from "./agents.ts";
import { ciText, latency } from "./comparison.ts";

/**
 * The overview page's display logic, as plain functions tested in Node.
 * Every number comes from a comparison set (or the team history); nothing
 * here is typed in by hand.
 */

/** "groq/gpt-oss-120b" → "gpt-oss-120b": the provider is noise on a summary page. */
export const shortModel = (id: string) => id.slice(id.indexOf("/") + 1);

/** How far to trust a set's numbers, in a few words, on every tile and chart. */
export const SPLIT_LABEL: Record<ComparisonSet["split"], string> = { test: "test: held out", dev: "dev: tuned on" };

const scored = (set: ComparisonSet) => set.models.filter((m) => m.report.taskSuccess.n > 0);
const percent = (rate: number) => Math.round(rate * 100);
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** "110" when every model had the same number of conversations, else "100–110". */
function conversationCount(set: ComparisonSet): string {
  const ns = set.models.map((m) => m.report.conversations);
  const lo = Math.min(...ns);
  const hi = Math.max(...ns);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

/**
 * One honest sentence (or two) about the set: who ran, who did best, and
 * whether any model can be recommended. The recommendation follows the
 * comparison's winner rule: a model that broke a business rule is never
 * named.
 */
export function headline(set: ComparisonSet): string {
  const models = scored(set);
  const kind = set.split === "test" ? "held-out" : "dev (tuned-on)";
  const ran = `${set.models.length === 1 ? "One model" : `${capitalize(numberWord(set.models.length))} models`} ran ${conversationCount(set)} ${kind} conversations${set.models.length > 1 ? " each" : ""}.`;
  if (models.length === 0) return `${ran} None has a scored result yet.`;

  const top = Math.max(...models.map((m) => percent(m.report.taskSuccess.rate)));
  const leaders = models.filter((m) => percent(m.report.taskSuccess.rate) === top).map((m) => shortModel(m.model));
  const best = leaders.length > 1 ? `${listWords(leaders)} tied at ${top}% task success` : `${leaders[0]} led at ${top}% task success`;

  const w = set.winner;
  if (w.kind === "none") {
    const allBroke = set.models.every((m) => m.report.policyViolations > 0);
    return allBroke ? `${ran} ${best}, and every model broke a business rule at least once, so none is recommended yet.` : `${ran} ${best}. No model can be recommended: ${w.reason}`;
  }
  const verdict =
    w.kind === "significant"
      ? `${shortModel(w.model)} is recommended: no policy violations, and ahead of ${shortModel(w.runnerUp!)} beyond the 95% intervals.`
      : w.runnerUp
        ? `${shortModel(w.model)} leads among models with no policy violations, but not significantly ahead of ${shortModel(w.runnerUp)}.`
        : `${shortModel(w.model)} is the only model with no policy violations.`;
  return `${ran} ${best}. ${verdict}`;
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The model the team runs for support (it moves money), or null before the team is known. */
export const teamModel = (roles: Pick<RoleView, "role" | "model">[]) => roles.find((r) => r.role === "support")?.model ?? null;

/**
 * Which model the tiles describe: the team's, if the set evaluated it;
 * otherwise the best-scoring one (and the tile says so).
 */
export function focusModel(set: ComparisonSet, team: string | null): { report: ModelReport; isTeam: boolean } | null {
  const onTeam = set.models.find((m) => m.model === team);
  if (onTeam) return { report: onTeam.report, isTeam: true };
  const best = [...scored(set)].sort((a, b) => b.report.taskSuccess.rate - a.report.taskSuccess.rate)[0];
  return best ? { report: best.report, isTeam: false } : null;
}

export type Tile = { label: string; value: string; detail: string; warn: boolean };

/** The four headline numbers, each naming its model, its count and its split. */
export function kpiTiles(set: ComparisonSet, team: string | null): Tile[] {
  const focus = focusModel(set, team);
  if (!focus) return [];
  const r = focus.report;
  const who = `${shortModel(r.model)}${focus.isTeam ? " (current team)" : " (best scored; not on the team)"}`;
  const split = SPLIT_LABEL[set.split];
  const violations = set.models.map((m) => m.report.policyViolations);
  const each = conversationCount(set);
  return [
    { label: `Task success · ${who}`, value: pct(r.taskSuccess.rate), detail: `${r.taskSuccess.k} of ${r.taskSuccess.n} · ${ciText(r.taskSuccess)} · ${split}`, warn: false },
    {
      label: "Policy violations (must be 0)",
      value: violations.join(" · "),
      detail: `${set.models.map((m) => shortModel(m.model)).join(" · ")}, ${each} conversations each · ${split}`,
      warn: violations.some((v) => v > 0),
    },
    {
      label: "Invented facts (grounding)",
      value: pct(r.conversationsWithGrounding.rate),
      detail: `${shortModel(r.model)}: ${r.conversationsWithGrounding.k} of ${r.conversationsWithGrounding.n} conversations · ${ciText(r.conversationsWithGrounding)} · ${split}`,
      warn: false,
    },
    {
      label: "Reply time, median turn",
      value: latency(r.turnLatencyMs.p50),
      detail: `${shortModel(r.model)} · p95 ${latency(r.turnLatencyMs.p95)} · $${r.costUsd.toFixed(2)} for ${r.conversations} conversations`,
      warn: false,
    },
  ];
}

export type Decision = { change: TeamChange; role: string; text: string; evidence: { model: string; text: string }[] };

/**
 * The latest switch, retire or reinstate across all roles, with the set's
 * task success for each model it involved; null until one exists (the page
 * then says so, never a placeholder decision).
 */
export function latestDecision(roles: Pick<RoleView, "role" | "history">[], set: ComparisonSet | null): Decision | null {
  const changes = roles.flatMap((r) => r.history).filter((c) => c.action !== "initial");
  const change = changes.sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)[0];
  if (!change) return null;
  const involved = [...new Set([change.fromModel, change.model, change.toModel].filter((m): m is string => !!m))];
  const evidence = involved.flatMap((model) => {
    const r = set?.models.find((m) => m.model === model)?.report.taskSuccess;
    return r && r.n ? [{ model: shortModel(model), text: `${pct(r.rate)} task success (${ciText(r)}, ${SPLIT_LABEL[set!.split]})` }] : [];
  });
  return { change, role: ROLE_LABEL[change.role], text: describeChange(change), evidence };
}

/**
 * The generated finding: each model's task success on the held-out test set
 * next to the dev set it was tuned on. null without both sets or common models.
 */
export function devGap(test: ComparisonSet | null, dev: ComparisonSet | null): { title: string; text: string } | null {
  if (!test || !dev || test.split !== "test" || dev.split !== "dev") return null;
  const pairs = scored(test).flatMap((t) => {
    const d = dev.models.find((m) => m.model === t.model)?.report.taskSuccess;
    return d && d.n ? [{ model: shortModel(t.model), dev: percent(d.rate), test: percent(t.report.taskSuccess.rate) }] : [];
  });
  if (pairs.length === 0) return null;
  const lower = pairs.filter((p) => p.test < p.dev).length;
  const title =
    lower === pairs.length ? "Held-out scores are lower than dev for every model" : lower === 0 ? "Held-out scores hold up against dev" : "Held-out scores are lower than dev for some models";
  return { title, text: `Task success, dev (tuned on) → test (held out): ${pairs.map((p) => `${p.model} ${p.dev}% → ${p.test}%`).join(", ")}.` };
}
