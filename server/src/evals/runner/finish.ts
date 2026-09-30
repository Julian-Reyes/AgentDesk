import { buildResults, judgedConversations, modelReport, renderJudgeComparison, renderReport } from "./report.ts";
import { judgeFor, regrade } from "./stages.ts";
import type { RunStore } from "./store.ts";

/**
 * Writes <run>/report.md, and <run>/judged.jsonl (the input for Julian's grading
 * sample: npm run judge:sample -- --from <run>/judged.jsonl). judge = null
 * reports without judge results, so cases that need the judge show as pending.
 * compareWith: another judge model (same rubric); if it judged any of the same
 * conversations, the report ends with a judge-vs-judge comparison on those.
 */
export function writeRunReport(store: RunStore, judge: { model: string; rubric: string } | null, compareWith?: string): string {
  // Re-graded with the current grader, so grader changes (e.g. global judge checks) apply to saved runs too.
  const records = regrade(store.conversations());
  const results = buildResults(records, (r) => (judge ? judgeFor(store, judge.model, judge.rubric, r) : null));
  const models = store.manifest()?.models.filter((m) => records.some((r) => r.agentModel === m)) ?? [...new Set(records.map((r) => r.agentModel))];
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
  const judged = judgedConversations(results);
  if (judged.length) store.writeText("judged.jsonl", `${judged.map((j) => JSON.stringify(j)).join("\n")}\n`);
  return md;
}
