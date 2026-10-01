/**
 * Apply approved case changes to a saved run, so it can be re-graded with no
 * agent calls:
 *   npm run eval:update-cases -- --name dev-1                      (shows what would change)
 *   npm run eval:update-cases -- --name dev-1 --reason "..." --yes (applies it)
 * Each changed conversation keeps its old case snapshot in caseHistory, and the
 * manifest records the update. Changes to the script, customer, judge checks or
 * judge note are refused (those need a new run or a re-judge).
 * Then: npm run eval:report -- --name dev-1
 */
import { parseArgs } from "node:util";
import { ALL_CASES } from "../evals/cases/index.ts";
import { applyCaseSnapshotUpdate, planCaseSnapshotUpdate } from "../evals/runner/update-cases.ts";
import { RunStore } from "../evals/runner/store.ts";

const { values } = parseArgs({ options: { name: { type: "string" }, reason: { type: "string" }, yes: { type: "boolean", default: false } } });
if (!values.name) {
  console.error('Usage: npm run eval:update-cases -- --name <run> [--reason "<why>" --yes]');
  process.exit(1);
}
const store = new RunStore(values.name);
if (!store.manifest()) {
  console.error(`No run named ${values.name} in ${store.dir}.`);
  process.exit(1);
}
const plan = planCaseSnapshotUpdate(store, ALL_CASES);
for (const c of plan.changes) console.log(`update  ${c.caseId} (${c.model}): ${c.fields.join(", ")}`);
for (const c of plan.refused) console.log(`REFUSED ${c.caseId} (${c.model}): ${c.why}`);
if (!plan.changes.length && !plan.refused.length) console.log("Every saved case snapshot already matches the current cases.");
if (plan.refused.length) process.exit(1);
if (!plan.changes.length) process.exit(0);
if (!values.yes || !values.reason) {
  console.log('\nNothing written. To apply: add --reason "<why>" --yes');
  process.exit(0);
}
applyCaseSnapshotUpdate(store, ALL_CASES, values.reason, new Date().toISOString());
console.log(`\nUpdated ${plan.changes.length} conversation(s). Now: npm run eval:report -- --name ${values.name}`);
