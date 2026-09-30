/**
 * Judge (or re-judge) a saved eval run without replaying any agent calls:
 *   npm run eval:judge -- --name dev-1 [--judge <model>] [--force] [--yes]
 * The judge defaults to judges.main in config/models.json.
 * Results are cached per conversation, judge model and rubric version, so only
 * conversations without a verdict are judged; --force redoes them all. Shows
 * the estimate and asks before starting. Writes the run's report afterwards.
 */
import { parseArgs } from "node:util";
import { promptId } from "../agents/prompts.ts";
import { JUDGE_RUBRIC } from "../evals/judge/rubric.ts";
import { confirm, coverageNote, judgeEventLine, throttleNotice } from "../evals/runner/cli.ts";
import { estimateJudge, renderEstimate } from "../evals/runner/estimate.ts";
import { writeRunReport } from "../evals/runner/finish.ts";
import { judgeCoverage, runJudgeStage, unjudged } from "../evals/runner/stages.ts";
import { RunStore } from "../evals/runner/store.ts";
import { getJudgeIds, getModelConfig, otherJudge } from "../llm/config.ts";
import { createProvider } from "../llm/factory.ts";

const { values } = parseArgs({
  options: { name: { type: "string" }, judge: { type: "string", default: getJudgeIds().main }, force: { type: "boolean", default: false }, yes: { type: "boolean", default: false } },
});
if (!values.name) {
  console.error("Usage: npm run eval:judge -- --name <run> [--judge <model>] [--force] [--yes]");
  process.exit(1);
}
const store = new RunStore(values.name);
if (!store.manifest()) {
  console.error(`No run named ${values.name} in ${store.dir}.`);
  process.exit(1);
}
const config = getModelConfig(values.judge);
const rubric = promptId(JUDGE_RUBRIC);
const todo = unjudged(store, config.id, rubric, values.force);
console.log(`\n${todo.length} of ${store.conversations().length} conversations to judge with ${config.id} (${rubric}).\n`);
if (todo.length) {
  console.log(renderEstimate([estimateJudge(config, todo.length)]), "\n");
  if (!values.yes && !(await confirm("Start?"))) {
    console.log("Not started. Rerun with --yes to start without asking.");
    process.exit(0);
  }
  await runJudgeStage({
    store,
    judgeModel: config.id,
    rubric,
    provider: createProvider(config, { throttle: throttleNotice }),
    force: values.force,
    onEvent: (e) => console.log(judgeEventLine(e)),
  });
}
console.log(coverageNote(judgeCoverage(store, config.id, rubric), config.id));
writeRunReport(store, { model: config.id, rubric }, otherJudge(config.id));
console.log(`Report: ${store.dir}/report.md`);
