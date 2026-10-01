/**
 * Run the eval cases against agent models, then judge them:
 *   npm run eval:run -- --name dev-1                      (dev split, the three cloud models, then the judge)
 *   npm run eval:run -- --name dev-1 --no-judge           (quick iteration: code checks only)
 *   npm run eval:run -- --name dev-1 --estimate-only      (just the preflight estimate)
 * Options: --split dev|test, --models a,b,c, --cases id,id, --judge <model>, --yes, --rerun-errors,
 * --prompts round-0|round-1|round-2 (the agents' prompt set; default the current one, round-2).
 *
 * Always prints the preflight estimate (calls, tokens, time per model, daily
 * limits, bottleneck) and asks before starting; --yes skips the question.
 * Each finished conversation is saved at once, so rerunning the same --name
 * resumes where it stopped (after a daily quota, Ctrl-C, a crash).
 * Replies are recorded in the LLM cache: rerunning finished work costs nothing.
 */
import { parseArgs } from "node:util";
import { promptId } from "../agents/prompts.ts";
import { PROMPT_SETS, type PromptSetName } from "../agents/prompts.ts";
import { buildTeam, loadTeamSpec } from "../agents/team.ts";
import { connect } from "../db/client.ts";
import { storeClock } from "../domain/clock.ts";
import { SPLITS } from "../evals/case-schema.ts";
import { ALL_CASES } from "../evals/cases/index.ts";
import { createGradingCatalog } from "../evals/grading/catalog.ts";
import { JUDGE_RUBRIC } from "../evals/judge/rubric.ts";
import { confirm, coverageNote, duration, judgeEventLine, throttleNotice } from "../evals/runner/cli.ts";
import { estimateAgents, estimateJudge, renderEstimate } from "../evals/runner/estimate.ts";
import { writeRunReport } from "../evals/runner/finish.ts";
import { judgeCoverage, runAgentsStage, runJudgeStage, unjudged } from "../evals/runner/stages.ts";
import { RunStore } from "../evals/runner/store.ts";
import { validateCases } from "../evals/validate-cases.ts";
import { getJudgeIds, getModelConfig, otherJudge } from "../llm/config.ts";
import { createProvider } from "../llm/factory.ts";
import { DbTracer } from "../tracing/tracer.ts";

const CLOUD_MODELS = ["gemini/gemini-3.5-flash-lite", "groq/gpt-oss-120b", "groq/qwen3.8-27b"];
const DEFAULT_JUDGE = getJudgeIds().main;

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    split: { type: "string", default: "dev" },
    models: { type: "string", default: CLOUD_MODELS.join(",") },
    cases: { type: "string" },
    judge: { type: "string", default: DEFAULT_JUDGE },
    "no-judge": { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    "estimate-only": { type: "boolean", default: false },
    "rerun-errors": { type: "boolean", default: false },
    prompts: { type: "string", default: "round-2" },
  },
});
const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

if (!values.name) fail("Give the run a name, e.g. --name dev-1 (the same name resumes it).");
if (!(SPLITS as readonly string[]).includes(values.split!)) fail(`--split must be one of ${SPLITS.join(", ")}`);
if (!(values.prompts! in PROMPT_SETS)) fail(`--prompts must be one of ${Object.keys(PROMPT_SETS).join(", ")}`);
const promptSet = values.prompts as PromptSetName;
const problems = validateCases(ALL_CASES);
if (problems.length) fail(`Eval cases don't match the seed data:\n${problems.join("\n")}`);

const wanted = values.cases?.split(",").map((s) => s.trim());
const cases = ALL_CASES.filter((c) => c.split === values.split && (!wanted || wanted.includes(c.id)));
if (cases.length === 0) fail("No cases selected.");
const models = values.models!.split(",").map((s) => s.trim());
const configs = models.map((m) => getModelConfig(m)); // unknown ids fail here
const judgeOn = !values["no-judge"];
const judgeConfig = judgeOn ? getModelConfig(values.judge) : null;
const rubric = promptId(JUDGE_RUBRIC);

const store = new RunStore(values.name!);
const existing = store.manifest();
if (existing && existing.split !== values.split) fail(`Run ${values.name} is a ${existing.split} run; use another --name.`);
// Runs saved before prompt sets existed used round-0's prompts.
if (existing && (existing.promptSet ?? "round-0") !== promptSet) fail(`Run ${values.name} uses prompts ${existing.promptSet ?? "round-0"}; resume it with --prompts ${existing.promptSet ?? "round-0"}, or use another --name.`);
const saved = store.conversations();
const errored = values["rerun-errors"] ? saved.filter((r) => r.providerError) : [];

// ---- Preflight estimate ----
const isDone = (m: string, id: string) => store.hasConversation(m, id) && !errored.some((r) => r.agentModel === m && r.caseId === id);
const estimates = configs.map((config) => {
  const remaining = cases.filter((c) => !isDone(config.id, c.id));
  const finished = saved
    .filter((r) => r.agentModel === config.id && !r.providerError)
    .map((r) => ({ calls: r.stats.modelCalls, inputTokens: r.stats.inputTokens, outputTokens: r.stats.outputTokens, latencyMs: r.stats.latencyMs }));
  return estimateAgents(config, remaining, finished);
});
const toRun = estimates.reduce((n, e) => n + e.conversations, 0);
if (judgeConfig) {
  const waiting = unjudged(store, judgeConfig.id, rubric).filter((r) => !errored.some((x) => x.agentModel === r.agentModel && x.caseId === r.caseId)).length;
  estimates.push(estimateJudge(judgeConfig, waiting + toRun));
}
console.log(`\nRun "${values.name}": prompts ${promptSet}, ${values.split} split, ${cases.length} cases × ${models.length} models; ${toRun} conversations to run${saved.length ? ` (${saved.length - errored.length} already saved)` : ""}.\n`);
console.log(renderEstimate(estimates));
console.log("");
if (values["estimate-only"]) process.exit(0);
if (!values.yes && !(await confirm("Start?"))) {
  console.log("Not started. Rerun with --yes to start without asking.");
  process.exit(0);
}

// ---- Stage 1: agents ----
store.saveManifest({
  name: values.name!,
  split: values.split!,
  models: [...new Set([...(existing?.models ?? []), ...models])],
  caseIds: [...new Set([...(existing?.caseIds ?? []), ...cases.map((c) => c.id)])],
  createdAt: existing?.createdAt ?? new Date().toISOString(),
  promptSet,
});
for (const r of errored) store.removeConversation(r.agentModel, r.caseId);

const main = connect();
const traces = connect(); // its own pool: traces must survive the per-conversation rollbacks
const walls = new Map<string, number[]>();
try {
  const stopped = await runAgentsStage({
    store,
    cases,
    models,
    teamFor: (m) => buildTeam(loadTeamSpec({ ...process.env, MODEL: m }), { throttle: throttleNotice, prompts: PROMPT_SETS[promptSet] }),
    db: main.db,
    tracer: new DbTracer(traces.db),
    clock: storeClock(),
    catalog: createGradingCatalog(),
    runName: values.name!,
    onEvent: (e) => {
      if (e.kind === "done") {
        const w = [...(walls.get(e.model) ?? []), e.wallMs];
        walls.set(e.model, w);
        const eta = (w.reduce((a, b) => a + b, 0) / w.length) * (e.total - e.index);
        console.log(`[${e.model}] ${e.index}/${e.total} ${e.caseId}: ${e.providerError ? `provider error (${e.providerError.slice(0, 80)})` : e.status} in ${duration(e.wallMs)}${e.index < e.total ? `, ETA ${duration(eta)}` : ""}`);
      } else if (e.kind === "stopped") {
        console.log(`[${e.model}] STOPPED with ${e.remaining} left: ${e.reason.slice(0, 160)}`);
      } else console.log(`[${e.model}] finished.`);
    },
  });
  const halted = Object.entries(stopped).filter(([, why]) => why);
  if (halted.length) console.log(`\n${halted.map(([m]) => m).join(", ")} hit a daily quota. Resume later with the same command (--name ${values.name}).`);

  // ---- Stage 2: judge ----
  if (judgeConfig) {
    console.log(`\nJudging with ${judgeConfig.id} (${rubric})…`);
    const why = await runJudgeStage({
      store,
      judgeModel: judgeConfig.id,
      rubric,
      provider: createProvider(judgeConfig, { throttle: throttleNotice }),
      onEvent: (e) => console.log(judgeEventLine(e)),
    });
    if (why) console.log(`The judge hit a daily quota. Resume with: npm run eval:judge -- --name ${values.name}`);
    console.log(coverageNote(judgeCoverage(store, judgeConfig.id, rubric), judgeConfig.id));
  }
} finally {
  await main.close();
  await traces.close();
}

const md = writeRunReport(store, judgeConfig ? { model: judgeConfig.id, rubric } : null, judgeConfig ? otherJudge(judgeConfig.id) : undefined);
console.log(`\n${md.split("\n## Most common failures")[0]}`);
console.log(`\nFull report: ${store.dir}/report.md`);
