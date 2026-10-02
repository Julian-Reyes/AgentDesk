import type { ComparisonSet, Mean, Rate, Winner } from "../lib/api.ts";

/** The Model comparison page's display logic, as plain functions tested in Node. */

/** "85% (67/79)"; "–" with nothing scored. */
export const rateText = (r: Rate | null | undefined) => (r && r.n ? `${Math.round(r.rate * 100)}% (${r.k}/${r.n})` : "–");

/** "70–91%": the 95% interval. */
export const ciText = (r: Rate) => (r.n ? `${Math.round(r.ci[0] * 100)}–${Math.round(r.ci[1] * 100)}%` : "");

/** "4.63 (4.50–4.75)": a mean with its 95% interval. */
export const meanText = (m: Mean | null | undefined) => (m ? `${m.mean.toFixed(2)} (${m.ci[0].toFixed(2)}–${m.ci[1].toFixed(2)})` : "–");

/**
 * Where to draw a rate and its interval on a 0–100% track, in percent of the
 * track's width. Clamped, because a Wilson interval never leaves [0, 1] but
 * rounding could.
 */
export function ciBar(r: Rate): { left: number; width: number; point: number } | null {
  if (!r.n) return null;
  const clamp = (x: number) => Math.min(100, Math.max(0, x * 100));
  const left = clamp(r.ci[0]);
  return { left, width: clamp(r.ci[1]) - left, point: clamp(r.rate) };
}

/** What the split means for how far to trust the numbers. Always shown. */
export const SPLIT_NOTE: Record<ComparisonSet["split"], string> = {
  dev: "Dev set: these cases were used to tune the prompts, so the numbers are optimistic.",
  test: "Test set: held out, never used for tuning. The fairest numbers here.",
};

/** The highlight above the table. */
export function winnerText(w: Winner): string {
  if (w.kind === "none") return `No winner: ${w.reason}`;
  if (w.kind === "significant") return `${w.model} has the highest task success among models with zero policy violations, ahead of ${w.runnerUp} beyond the 95% intervals.`;
  return w.runnerUp
    ? `${w.model} leads, not significant: its 95% interval overlaps ${w.runnerUp}'s, so this data can't separate them.`
    : `${w.model} is the only model with zero policy violations and scored conversations.`;
}

/** "3 pts" for a repeat gap; "single run" without repeats. */
export const gapText = (gap: number | null) => (gap === null ? "single run" : `${Math.round(gap * 100)} pts`);

export const latency = (v: number | null) => (v === null ? "–" : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`);
