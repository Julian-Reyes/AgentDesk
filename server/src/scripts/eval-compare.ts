/**
 * Compare saved runs side by side, per agent model (no model calls):
 *   npm run eval:compare -- dev-1 dev-1b dev-2 [--judge <model>]
 * Every run is graded by the current grader and judged by the same judge and
 * rubric (the current one); a run without those verdicts shows them as missing,
 * so judge it first (npm run eval:judge -- --name <run>).
 * Writes eval-results/comparisons/<run>__<run>__....md.
 *
 * Repeats of one configuration are grouped as label=run,run (round 2):
 *   npm run eval:compare -- dev-1b dev-2 r1=dev-3-r1a,dev-3-r1b r2=dev-3-r2a,dev-3-r2b
 * Each group is pooled over its repeats and shown with its repeat gap; a plain
 * run name is a group of one.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { promptId } from "../agents/prompts.ts";
import { JUDGE_RUBRIC } from "../evals/judge/rubric.ts";
import { renderComparison, renderGroupedComparison, summarizeRun, type RunGroup } from "../evals/runner/compare.ts";
import { DEFAULT_RESULTS_DIR, RunStore } from "../evals/runner/store.ts";
import { getJudgeIds } from "../llm/config.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { judge: { type: "string", default: getJudgeIds().main } } });
if (positionals.length < 2) {
  console.error("Usage: npm run eval:compare -- <run|label=run,run> <run|label=run,run> [...] [--judge <model>]");
  process.exit(1);
}
const judge = { model: values.judge!, rubric: promptId(JUDGE_RUBRIC) };
const load = (name: string) => {
  const store = new RunStore(name);
  const m = store.manifest();
  if (!m) {
    console.error(`No run named ${name} in ${store.dir}.`);
    process.exit(1);
  }
  return { name, promptSet: m.promptSet ?? "round-0", summary: summarizeRun(store, judge) };
};
const grouped = positionals.some((p) => p.includes("="));
let md: string;
if (grouped) {
  const groups: RunGroup[] = positionals.map((p) => {
    const [label, list] = p.includes("=") ? (p.split("=", 2) as [string, string]) : [p, p];
    const runs = list.split(",").map((n) => load(n.trim()));
    const sets = [...new Set(runs.map((r) => r.promptSet))];
    return { label: `${label} (prompts ${sets.join("/")})`, runs };
  });
  md = renderGroupedComparison(groups, `${judge.model}, ${judge.rubric}`);
} else {
  const runs = positionals.map(load).map((r) => ({ name: `${r.name} (prompts ${r.promptSet})`, summary: r.summary }));
  md = renderComparison(runs, `${judge.model}, ${judge.rubric}`);
}
const dir = join(DEFAULT_RESULTS_DIR, "..", "comparisons");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${positionals.map((p) => p.split("=")[0]).join("__")}.md`);
writeFileSync(file, `${md}\n`);
console.log(md, `\n\nWritten to ${file}`);
