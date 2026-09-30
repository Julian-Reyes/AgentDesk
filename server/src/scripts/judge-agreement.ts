/**
 * Agreement between the judge and Julian's blind grades:
 *   npm run judge:agreement -- <dir> [--second-judge gemini/gemma-4-31b]
 * (the configured second judge is judges.second in config/models.json)
 * Needs every item graded. With --second-judge, first runs that model as a
 * second judge on the sampled conversations only (saved into key.json as it
 * goes, so an interrupted run resumes), then also reports second judge vs
 * Julian and first vs second judge. Writes <dir>/agreement.md.
 *
 * If the second judge already judged a sampled conversation in a saved eval
 * run (same conversation run id, same rubric, byte-identical input), that
 * verdict is reused instead of calling the model again. A provider error
 * (e.g. Gemma's HTTP 500s) leaves the item open for the next run; only invalid
 * output after the judge's own retry counts as a failure.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pairsBetweenJudges, pairsWithHuman, renderReport, report } from "../evals/judge/agreement.ts";
import { runJudge } from "../evals/judge/judge.ts";
import { verdictFor, type GradingItem, type HumanGrade, type KeyEntry } from "../evals/judge/sample.ts";
import { DEFAULT_RESULTS_DIR, RunStore } from "../evals/runner/store.ts";
import { getModelConfig } from "../llm/config.ts";
import { createProvider } from "../llm/factory.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { "second-judge": { type: "string" } } });
const dir = positionals[0];
if (!dir) {
  console.error("Usage: npm run judge:agreement -- <dir> [--second-judge <model config id>]");
  process.exit(1);
}
const items = JSON.parse(readFileSync(join(dir, "sample.json"), "utf8")) as GradingItem[];
const keyPath = join(dir, "key.json");
const key = JSON.parse(readFileSync(keyPath, "utf8")) as KeyEntry[];
const grades = JSON.parse(readFileSync(join(dir, "grades.json"), "utf8")) as Record<string, HumanGrade>;
const missing = items.filter((i) => !grades[i.itemId]);
if (missing.length) {
  console.error(`${missing.length} of ${items.length} items aren't graded yet (${missing.map((i) => i.itemId).join(", ")}). Finish with npm run judge:grade -- ${dir}`);
  process.exit(1);
}

const secondId = values["second-judge"];
if (secondId) {
  const config = getModelConfig(secondId);
  const provider = createProvider(config);
  let open = 0;
  for (const entry of key.filter((k) => k.second === undefined)) {
    const item = items.find((i) => i.itemId === entry.itemId)!;
    const saved = savedVerdict(config.id, entry, item);
    if (saved) {
      entry.second = verdictFor({ model: config.id, rubric: saved.rubric, output: saved.output! }, entry.reply);
      console.log(`Second judge (${secondId}) on ${entry.itemId}: reused its verdict from the eval run`);
    } else {
      process.stdout.write(`Second judge (${secondId}) on ${entry.itemId}… `);
      try {
        const r = await runJudge(provider, item.input);
        entry.second = r.ok ? verdictFor({ model: config.id, rubric: r.rubric, output: r.output }, entry.reply) : null;
        console.log(r.ok ? "done" : `failed: ${r.error}`);
      } catch (e) {
        open += 1;
        console.log(`provider error, left for the next run: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    writeFileSync(keyPath, `${JSON.stringify(key, null, 2)}\n`);
  }
  if (open) console.log(`${open} item(s) still need the second judge (provider errors). Rerun this command to retry them.`);
}

/** A verdict the same judge model already gave this exact conversation in a saved eval run, if any. */
function savedVerdict(judgeModel: string, entry: KeyEntry, item: GradingItem) {
  const runs = existsSync(DEFAULT_RESULTS_DIR) ? readdirSync(DEFAULT_RESULTS_DIR) : [];
  for (const run of runs) {
    const j = new RunStore(run).judgeRecord(judgeModel, entry.judge.rubric, entry.agentModel, entry.caseId);
    if (j?.ok && j.runId === entry.runId && JSON.stringify(j.input) === JSON.stringify(item.input)) return j;
  }
  return null;
}

const first = key[0]!.judge.model;
const sections = [
  `# Judge agreement (${items.length} replies, ${key[0]!.judge.rubric})`,
  "",
  renderReport(`First judge (${first}) vs Julian`, report(pairsWithHuman(key, grades, "judge"))),
];
if (key.some((k) => k.second)) {
  const second = key.find((k) => k.second)!.second!.model;
  const failed = key.filter((k) => k.second === null).length;
  sections.push(
    renderReport(`Second judge (${second}) vs Julian`, report(pairsWithHuman(key, grades, "second"))),
    renderReport(`First judge (${first}) vs second judge (${second})`, report(pairsBetweenJudges(key))),
    ...(failed ? [`The second judge failed on ${failed} conversation(s); they're left out of its rows.`] : []),
  );
}
const md = sections.join("\n");
writeFileSync(join(dir, "agreement.md"), `${md}\n`);
console.log(md);
