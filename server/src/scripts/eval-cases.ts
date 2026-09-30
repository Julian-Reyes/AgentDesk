/**
 * Print eval cases as a plain-English review sheet (Markdown):
 *   npm run eval:cases -- --split dev
 *   npm run eval:cases -- --split dev --type returns
 *   npm run eval:cases -- --id returns-01
 *   npm run eval:cases -- --split dev > dev-cases.md
 *
 * Validates every case against the seed data first; any problem is printed
 * and nothing else, so a sheet is never shown for a case that can't be right.
 * No database or model needed.
 */
import { parseArgs } from "node:util";
import { CASE_TYPES, SPLITS } from "../evals/case-schema.ts";
import { ALL_CASES } from "../evals/cases/index.ts";
import { describeCases } from "../evals/describe-case.ts";
import { validateCases } from "../evals/validate-cases.ts";

const { values } = parseArgs({
  options: { split: { type: "string" }, type: { type: "string" }, id: { type: "string" } },
});

const fail = (msg: string) => {
  console.error(msg);
  process.exit(1);
};
if (values.split && !(SPLITS as readonly string[]).includes(values.split)) fail(`--split must be one of: ${SPLITS.join(", ")}`);
if (values.type && !(CASE_TYPES as readonly string[]).includes(values.type)) fail(`--type must be one of: ${CASE_TYPES.join(", ")}`);

const problems = validateCases(ALL_CASES);
if (problems.length) fail(`Eval cases don't match the seed data:\n${problems.map((p) => `  - ${p}`).join("\n")}`);

const cases = ALL_CASES.filter(
  (c) => (!values.split || c.split === values.split) && (!values.type || c.type === values.type) && (!values.id || c.id === values.id),
);
if (cases.length === 0) fail("No cases match those filters.");

const title = ["Eval cases", values.split && `${values.split} split`, values.type && values.type.replaceAll("_", " "), values.id]
  .filter(Boolean)
  .join(": ");
console.log(describeCases(cases, title));
