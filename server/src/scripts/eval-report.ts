/**
 * Rebuild a run's report from its saved files (no model calls):
 *   npm run eval:report -- --name dev-1 [--judge gemini/gemma-4-31b | --no-judge]
 * Writes <run>/report.md and <run>/judged.jsonl (the input for npm run judge:sample).
 */
import { parseArgs } from "node:util";
import { promptId } from "../agents/prompts.ts";
import { JUDGE_RUBRIC } from "../evals/judge/rubric.ts";
import { writeRunReport } from "../evals/runner/finish.ts";
import { RunStore } from "../evals/runner/store.ts";

const { values } = parseArgs({ options: { name: { type: "string" }, judge: { type: "string", default: "gemini/gemma-4-31b" }, "no-judge": { type: "boolean", default: false } } });
if (!values.name) {
  console.error("Usage: npm run eval:report -- --name <run> [--judge <model> | --no-judge]");
  process.exit(1);
}
const store = new RunStore(values.name);
if (!store.manifest()) {
  console.error(`No run named ${values.name} in ${store.dir}.`);
  process.exit(1);
}
console.log(writeRunReport(store, values["no-judge"] ? null : { model: values.judge!, rubric: promptId(JUDGE_RUBRIC) }));
