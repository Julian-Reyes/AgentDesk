import { buildResults, judgedConversations, modelReport, renderReport } from "./report.ts";
import { judgeFor } from "./stages.ts";
import type { RunStore } from "./store.ts";

/**
 * Writes <run>/report.md, and <run>/judged.jsonl (the input for Julian's grading
 * sample: npm run judge:sample -- --from <run>/judged.jsonl). judge = null
 * reports without judge results, so cases that need the judge show as pending.
 */
export function writeRunReport(store: RunStore, judge: { model: string; rubric: string } | null): string {
  const records = store.conversations();
  const results = buildResults(records, (r) => (judge ? judgeFor(store, judge.model, judge.rubric, r) : null));
  const models = store.manifest()?.models.filter((m) => records.some((r) => r.agentModel === m)) ?? [...new Set(records.map((r) => r.agentModel))];
  const reports = models.map((m) => modelReport(m, results.filter((r) => r.record.agentModel === m)));
  const name = store.manifest()?.name ?? "eval run";
  const md = renderReport(`Eval run: ${name}`, reports, results, judge ? `${judge.model}, ${judge.rubric}` : null);
  store.writeText("report.md", `${md}\n`);
  const judged = judgedConversations(results);
  if (judged.length) store.writeText("judged.jsonl", `${judged.map((j) => JSON.stringify(j)).join("\n")}\n`);
  return md;
}
