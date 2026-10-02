import { buildResults, judgedConversations, modelReport, renderJudgeComparison, renderReport, type ConversationResult, type ModelReport } from "./report.ts";
import { judgeFor, regrade } from "./stages.ts";
import type { RunStore } from "./store.ts";

/** report.json: the exact ModelReport[] that report.md renders, for the dashboard. */
export type RunReportJson = { run: string; split: string | null; promptSet: string | null; judge: string | null; models: ModelReport[] };

/**
 * A run's results and per-model reports, graded with the current grader and
 * judged by `judge` (null = without the judge). One function, so report.md,
 * report.json and the comparison sets (comparison-sets.ts) all start from the
 * same numbers.
 */
export function runResults(store: RunStore, judge: { model: string; rubric: string } | null): { results: ConversationResult[]; models: string[] } {
  // Re-graded with the current grader, so grader changes (e.g. global judge checks) apply to saved runs too.
  const records = regrade(store.conversations());
  const results = buildResults(records, (r) => (judge ? judgeFor(store, judge.model, judge.rubric, r) : null));
  const models = store.manifest()?.models.filter((m) => records.some((r) => r.agentModel === m)) ?? [...new Set(records.map((r) => r.agentModel))];
  return { results, models };
}

/**
 * Writes <run>/report.md, <run>/report.json (the same reports, as data), and <run>/judged.jsonl (the input for Julian's grading
 * sample: npm run judge:sample -- --from <run>/judged.jsonl). judge = null
 * reports without judge results, so cases that need the judge show as pending.
 * compareWith: another judge model (same rubric); if it judged any of the same
 * conversations, the report ends with a judge-vs-judge comparison on those.
 */
export function writeRunReport(store: RunStore, judge: { model: string; rubric: string } | null, compareWith?: string): string {
  const { results, models } = runResults(store, judge);
  const reports = models.map((m) => modelReport(m, results.filter((r) => r.record.agentModel === m)));
  const name = store.manifest()?.name ?? "eval run";
  let md = renderReport(`Eval run: ${name}`, reports, results, judge ? `${judge.model}, ${judge.rubric}` : null);
  if (judge && compareWith && compareWith !== judge.model) {
    const both = results.flatMap((r) => {
      const other = judgeFor(store, compareWith, judge.rubric, r.record);
      return r.judge?.ok && other?.ok ? [{ record: r.record, main: r.judge, other }] : [];
    });
    if (both.length) md += `\n\n${renderJudgeComparison(judge.model, compareWith, both)}`;
  }
  store.writeText("report.md", `${md}\n`);
  const manifest = store.manifest();
  const json: RunReportJson = {
    run: name,
    split: manifest?.split ?? null,
    promptSet: manifest?.promptSet ?? null,
    judge: judge ? `${judge.model}, ${judge.rubric}` : null,
    models: reports,
  };
  store.writeText("report.json", `${JSON.stringify(json, null, 2)}\n`);
  const judged = judgedConversations(results);
  if (judged.length) store.writeText("judged.jsonl", `${judged.map((j) => JSON.stringify(j)).join("\n")}\n`);
  return md;
}
