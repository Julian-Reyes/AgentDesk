/**
 * Compare saved runs side by side, per agent model (no model calls):
 *   npm run eval:compare -- dev-1 dev-1b dev-2 [--judge <model>]
 * Every run is graded by the current grader and judged by the same judge and
 * rubric (the current one); a run without those verdicts shows them as missing,
 * so judge it first (npm run eval:judge -- --name <run>).
 * Writes eval-results/comparisons/<run>__<run>__....md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { promptId } from "../agents/prompts.ts";
import { JUDGE_RUBRIC } from "../evals/judge/rubric.ts";
import { renderComparison, summarizeRun } from "../evals/runner/compare.ts";
import { DEFAULT_RESULTS_DIR, RunStore } from "../evals/runner/store.ts";
import { getJudgeIds } from "../llm/config.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { judge: { type: "string", default: getJudgeIds().main } } });
if (positionals.length < 2) {
  console.error("Usage: npm run eval:compare -- <run> <run> [<run>...] [--judge <model>]");
  process.exit(1);
}
const judge = { model: values.judge!, rubric: promptId(JUDGE_RUBRIC) };
const runs = positionals.map((name) => {
  const store = new RunStore(name);
  const m = store.manifest();
  if (!m) {
    console.error(`No run named ${name} in ${store.dir}.`);
    process.exit(1);
  }
  return { name: `${name} (prompts ${m.promptSet ?? "round-0"})`, summary: summarizeRun(store, judge) };
});
const md = renderComparison(runs, `${judge.model}, ${judge.rubric}`);
const dir = join(DEFAULT_RESULTS_DIR, "..", "comparisons");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${positionals.join("__")}.md`);
writeFileSync(file, `${md}\n`);
console.log(md, `\n\nWritten to ${file}`);
