/**
 * Agreement between the judges and Julian's blind grades:
 *   npm run judge:agreement -- <dir> [--judge <model>] [--second-judge <model>]
 * (the configured judges are judges.main / judges.second in config/models.json)
 * Needs every item graded. Without flags it compares the verdicts the sample
 * was drawn from with Julian (no model calls).
 *
 * With --judge and/or --second-judge, each named judge gets a verdict for every
 * sampled conversation under the CURRENT rubric:
 *  - reused from a saved eval run when that judge already judged this exact
 *    conversation (same run id, same rubric, byte-identical input), else
 *  - judged now. Saved into key.json as it goes, so an interrupted run resumes.
 * A provider error (e.g. Gemma's HTTP 500s) leaves the item open for the next
 * run; only invalid output after the judge's own retries counts as a failure.
 *
 * The report (<dir>/agreement.md): the drawn verdicts vs Julian (the "before"
 * row when the rubric has changed since), each named judge vs Julian, and the
 * two judges vs each other. Each is broken down per agent model and per
 * yes/no question group.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { promptId } from "../agents/prompts.ts";
import { added, drawn, pairsBetweenJudges, pairsWithHuman, renderReport, report, type VerdictPick } from "../evals/judge/agreement.ts";
import { runJudge } from "../evals/judge/judge.ts";
import { JUDGE_RUBRIC } from "../evals/judge/rubric.ts";
import { verdictFor, verdictKey, type GradingItem, type HumanGrade, type KeyEntry } from "../evals/judge/sample.ts";
import { DEFAULT_RESULTS_DIR, RunStore } from "../evals/runner/store.ts";
import { getModelConfig } from "../llm/config.ts";
import { createProvider } from "../llm/factory.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { judge: { type: "string" }, "second-judge": { type: "string" } } });
const dir = positionals[0];
if (!dir) {
  console.error("Usage: npm run judge:agreement -- <dir> [--judge <model config id>] [--second-judge <model config id>]");
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

const rubric = promptId(JUDGE_RUBRIC);
const judges = [values.judge, values["second-judge"]].filter((j): j is string => !!j).map((id) => getModelConfig(id).id);

/** Verdicts for one judge on every item, under the current rubric: reused from saved runs, else judged now. Returns how many are still open. */
async function collect(judgeModel: string): Promise<number> {
  const k = verdictKey(judgeModel, rubric);
  const provider = createProvider(getModelConfig(judgeModel));
  let open = 0;
  for (const entry of key.filter((e) => e.verdicts?.[k] === undefined)) {
    const item = items.find((i) => i.itemId === entry.itemId)!;
    const saved = savedVerdict(judgeModel, entry, item);
    entry.verdicts ??= {};
    if (saved) {
      entry.verdicts[k] = verdictFor({ model: judgeModel, rubric, output: saved.output! }, entry.reply);
      console.log(`${judgeModel} on ${entry.itemId}: reused its verdict from the eval run`);
    } else {
      process.stdout.write(`${judgeModel} on ${entry.itemId}… `);
      try {
        const r = await runJudge(provider, item.input);
        entry.verdicts[k] = r.ok ? verdictFor({ model: judgeModel, rubric: r.rubric, output: r.output }, entry.reply) : null;
        console.log(r.ok ? "done" : `failed: ${r.error}`);
      } catch (e) {
        open += 1;
        delete entry.verdicts[k];
        console.log(`provider error, left for the next run: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    writeFileSync(keyPath, `${JSON.stringify(key, null, 2)}\n`);
  }
  return open;
}

/** A verdict this judge model already gave this exact conversation in a saved eval run, under the current rubric. */
function savedVerdict(judgeModel: string, entry: KeyEntry, item: GradingItem) {
  const runs = existsSync(DEFAULT_RESULTS_DIR) ? readdirSync(DEFAULT_RESULTS_DIR) : [];
  for (const run of runs) {
    const j = new RunStore(run).judgeRecord(judgeModel, rubric, entry.agentModel, entry.caseId);
    if (j?.ok && j.runId === entry.runId && JSON.stringify(j.input) === JSON.stringify(item.input)) return j;
  }
  return null;
}

let open = 0;
for (const j of judges) open += await collect(j);
if (open) console.log(`${open} verdict(s) still missing (provider errors). Rerun this command to retry them; they're left out of the report until then.`);

const first = key[0]!.judge;
const label = (model: string, r: string) => `${model}, ${r}`;
const sections = [`# Judge agreement (${items.length} replies graded by Julian)`, ""];
const failures = (pick: VerdictPick) => key.filter((k) => pick(k) === null).length;
const section = (title: string, pick: VerdictPick) => {
  sections.push(renderReport(title, report(pairsWithHuman(key, grades, pick))));
  const failed = failures(pick);
  if (failed) sections.push(`This judge failed on ${failed} conversation(s); they're left out of its rows.`, "");
};
const named = judges.map((j) => ({ model: j, pick: added(verdictKey(j, rubric)) }));
const drawnIsCurrent = named.some((n) => n.model === first.model && first.rubric === rubric);
if (!drawnIsCurrent) section(`${first.rubric === rubric ? "" : "Before: "}${label(first.model, first.rubric)} vs Julian`, drawn);
for (const n of named) section(`${label(n.model, rubric)} vs Julian`, n.pick);
if (named.length === 2) {
  sections.push(renderReport(`${label(named[0]!.model, rubric)} vs ${label(named[1]!.model, rubric)}`, report(pairsBetweenJudges(key, named[0]!.pick, named[1]!.pick))));
}
const md = sections.join("\n");
writeFileSync(join(dir, "agreement.md"), `${md}\n`);
console.log(md);
