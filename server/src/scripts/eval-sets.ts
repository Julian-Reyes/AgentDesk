/**
 * Precompute the Model comparison page's data (no model calls):
 *   npm run eval:sets
 * For each set in config/comparison.json, pools its runs per model with the
 * current grader and the main judge, and writes
 * eval-results/comparisons/sets/<id>.json. Rerun it after a new run is added
 * to a set, or after a grader or judge change; a test fails while the
 * committed files are out of date.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promptId } from "../agents/prompts.ts";
import { JUDGE_RUBRIC } from "../evals/judge/rubric.ts";
import { buildComparisonSet, loadComparisonConfig, SETS_DIR } from "../evals/runner/comparison-sets.ts";
import { RunStore } from "../evals/runner/store.ts";
import { getJudgeIds } from "../llm/config.ts";

const judge = { model: getJudgeIds().main, rubric: promptId(JUDGE_RUBRIC) };
mkdirSync(SETS_DIR, { recursive: true });
for (const spec of loadComparisonConfig()) {
  const set = buildComparisonSet(spec, (run) => new RunStore(run), judge);
  writeFileSync(join(SETS_DIR, `${spec.id}.json`), `${JSON.stringify(set, null, 2)}\n`);
  const w = set.winner;
  console.log(`${spec.id}: ${set.models.length} models, ${w.kind === "none" ? `no winner (${w.reason})` : `${w.model} ${w.kind === "significant" ? "wins" : "leads, not significant"}`}`);
}
