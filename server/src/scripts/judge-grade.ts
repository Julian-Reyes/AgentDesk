/**
 * Julian's blind grading tool for the judge-agreement check:
 *   npm run judge:grade -- <dir>
 * Shows each reply with the same inputs the judge saw (the conversation, what
 * the tools returned, the case's note on a good answer), in shuffled order,
 * with no model names and no judge scores (it never reads key.json). Scores use
 * rubric@1 (docs/JUDGE_RUBRIC.md). Saves to <dir>/grades.json after every item,
 * so you can stop (type q) and resume any time.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { gradingQuestions, parseScore, parseYesNo, renderGradingItem, type GradingItem, type HumanGrade } from "../evals/judge/sample.ts";
import { getJudgeIds } from "../llm/config.ts";

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "sample.json"))) {
  console.error("Usage: npm run judge:grade -- <dir>   (the directory made by npm run judge:sample)");
  process.exit(1);
}
const items = JSON.parse(readFileSync(join(dir, "sample.json"), "utf8")) as GradingItem[];
const gradesPath = join(dir, "grades.json");
const grades: Record<string, HumanGrade> = existsSync(gradesPath) ? JSON.parse(readFileSync(gradesPath, "utf8")) : {};

const rl = createInterface({ input: process.stdin, output: process.stdout });
// Read lines through one iterator (rl.question can drop piped lines).
const lines = rl[Symbol.asyncIterator]();
class Quit extends Error {}
async function ask<T>(prompt: string, parse: (s: string) => T | null): Promise<T> {
  for (;;) {
    process.stdout.write(prompt);
    const { value, done } = await lines.next();
    if (done || value.trim() === "q") throw new Quit();
    const parsed = parse(value);
    if (parsed !== null) return parsed;
    console.log("  (please answer as asked, or q to stop)");
  }
}

console.log(`Scale (rubric@1, docs/JUDGE_RUBRIC.md): 5 excellent · 4 one small issue · 3 so-so · 2 clearly off · 1 bad. Type q to stop; progress is saved.`);
const todo = items.filter((i) => !grades[i.itemId]);
console.log(`${items.length - todo.length} of ${items.length} already graded.\n`);
try {
  for (const item of todo) {
    console.log(renderGradingItem(item, items.indexOf(item) + 1, items.length), "\n");
    const tone = await ask("Tone (1-5): ", parseScore);
    const clarity = await ask("Clarity (1-5): ", parseScore);
    const helpfulness = await ask("Helpfulness (1-5): ", parseScore);
    const answers: Record<string, boolean> = {};
    for (const q of gradingQuestions(item)) answers[q.id] = await ask(`${q.prompt} (y/n): `, parseYesNo);
    const note = await ask("Note (optional, Enter to skip): ", (s) => s.trim());
    grades[item.itemId] = { tone, clarity, helpfulness, answers, ...(note ? { note } : {}) };
    writeFileSync(gradesPath, `${JSON.stringify(grades, null, 2)}\n`);
    console.log(`Saved ${item.itemId}.\n`);
  }
  console.log(`All ${items.length} graded. Next: npm run judge:agreement -- ${dir} --second-judge ${getJudgeIds().second}`);
} catch (e) {
  if (!(e instanceof Quit)) throw e;
  console.log(`\nStopped. ${Object.keys(grades).length} of ${items.length} graded; run the same command to continue.`);
} finally {
  rl.close();
}
