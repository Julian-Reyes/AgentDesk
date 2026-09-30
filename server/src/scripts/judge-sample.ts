/**
 * Draw Julian's blind grading sample from judged conversations (a JSONL file
 * the eval runner writes, one JudgedConversation per line):
 *   npm run judge:sample -- --from <judged.jsonl> --out <dir> [--size 30] [--seed 20260930]
 * Writes <dir>/sample.json (what Julian sees: no model names, no judge scores,
 * shuffled) and <dir>/key.json (models, run ids, judge scores). Grade with
 * `npm run judge:grade -- <dir>`; don't open key.json until you're done.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { sampleForGrading, type JudgedConversation } from "../evals/judge/sample.ts";

const { values } = parseArgs({ options: { from: { type: "string" }, out: { type: "string" }, size: { type: "string", default: "30" }, seed: { type: "string", default: "20260930" } } });
if (!values.from || !values.out) {
  console.error("Usage: npm run judge:sample -- --from <judged.jsonl> --out <dir> [--size 30] [--seed 20260930]");
  process.exit(1);
}
if (existsSync(join(values.out, "sample.json"))) {
  console.error(`${values.out}/sample.json already exists; a sample is drawn once. Use a new --out directory.`);
  process.exit(1);
}
const conversations = readFileSync(values.from, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as JudgedConversation);
const { items, key } = sampleForGrading(conversations, Number(values.size), Number(values.seed));
mkdirSync(values.out, { recursive: true });
writeFileSync(join(values.out, "sample.json"), `${JSON.stringify(items, null, 2)}\n`);
writeFileSync(join(values.out, "key.json"), `${JSON.stringify(key, null, 2)}\n`);
const perModel = new Map<string, number>();
for (const k of key) perModel.set(k.agentModel, (perModel.get(k.agentModel) ?? 0) + 1);
console.log(`Sampled ${items.length} replies from ${conversations.length} conversations: ${[...perModel].map(([m, n]) => `${n} from ${m}`).join(", ")}.`);
console.log(`Grade them with: npm run judge:grade -- ${values.out}`);
