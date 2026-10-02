import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { wilson } from "../judge/agreement.ts";
import { runResults } from "./finish.ts";
import { modelReport, type ModelReport } from "./report.ts";
import type { RunStore } from "./store.ts";

/**
 * The Model comparison page's data. A comparison set is a few saved runs of
 * the same configuration (config/comparison.json), e.g. two repeats of the dev
 * set with round-2 prompts. Per model, the set's conversations are pooled and
 * run through modelReport, the same function behind each run's report.md, so
 * a one-run set shows exactly that run's numbers. `npm run eval:sets` writes
 * one JSON file per set; the API only reads them (no grading per request, and
 * a deployed server serves the same numbers that are committed).
 */

const SetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    label: z.string().min(1),
    /** dev = used to tune the prompts (optimistic); test = held out. Always shown on the page. */
    split: z.enum(["dev", "test"]),
    runs: z.array(z.string().min(1)).min(1),
  })
  .strict();
const FileSchema = z.object({ sets: z.array(SetSchema).min(1) }).strict();
export type ComparisonSetSpec = z.infer<typeof SetSchema>;

export const COMPARISON_CONFIG = fileURLToPath(new URL("../../../config/comparison.json", import.meta.url));
export const SETS_DIR = fileURLToPath(new URL("../../../eval-results/comparisons/sets", import.meta.url));

/** The sets the page offers, first = the default. Ids must be unique. */
export function loadComparisonConfig(path = COMPARISON_CONFIG): ComparisonSetSpec[] {
  const { sets } = FileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const ids = sets.map((s) => s.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`config/comparison.json: duplicate set id "${dup}"`);
  return sets;
}

type Rate = ModelReport["taskSuccess"];

export type Winner =
  | { kind: "none"; reason: string }
  | { kind: "significant" | "not_significant"; model: string; runnerUp: string | null };

/**
 * The winner rule: the highest task success among models with zero policy
 * violations. A model that broke a business rule can't win, however well it
 * did otherwise. If the leader's 95% interval overlaps the runner-up's, it
 * only "leads, not significant": the data can't tell them apart.
 * Models with no scored conversations take no part.
 */
export function pickWinner(models: { model: string; taskSuccess: Rate; policyViolations: number }[]): Winner {
  const scored = models.filter((m) => m.taskSuccess.n > 0);
  if (scored.length === 0) return { kind: "none", reason: "No model has scored conversations." };
  const eligible = scored.filter((m) => m.policyViolations === 0).sort((a, b) => b.taskSuccess.rate - a.taskSuccess.rate || a.model.localeCompare(b.model));
  if (eligible.length === 0) return { kind: "none", reason: "Every model had at least one policy violation." };
  const [first, second] = eligible as [(typeof eligible)[0], (typeof eligible)[0] | undefined];
  if (!second) return { kind: "not_significant", model: first.model, runnerUp: null };
  const overlap = first.taskSuccess.ci[0] <= second.taskSuccess.ci[1] && second.taskSuccess.ci[0] <= first.taskSuccess.ci[1];
  return { kind: overlap ? "not_significant" : "significant", model: first.model, runnerUp: second.model };
}

export type SetModel = {
  model: string;
  /** All the set's conversations for this model, through modelReport. */
  report: ModelReport;
  /** Each run on its own (the repeats). */
  repeats: { run: string; taskSuccess: Rate }[];
  /** Largest task-success difference between repeats; null for a single run. */
  repeatGap: number | null;
};

export type ComparisonSet = ComparisonSetSpec & { judge: string; promptSets: string[]; models: SetModel[]; winner: Winner };

export function buildComparisonSet(spec: ComparisonSetSpec, storeFor: (run: string) => RunStore, judge: { model: string; rubric: string }): ComparisonSet {
  const runs = spec.runs.map((name) => {
    const store = storeFor(name);
    const manifest = store.manifest();
    if (!manifest) throw new Error(`Comparison set ${spec.id}: no run named ${name}.`);
    if (manifest.split !== spec.split) throw new Error(`Comparison set ${spec.id}: run ${name} is on the ${manifest.split} split, not ${spec.split}.`);
    return { name, promptSet: manifest.promptSet ?? "round-0", ...runResults(store, judge) };
  });
  // Models in the order the first run lists them; a model missing from every run is simply absent.
  const order = [...new Set(runs.flatMap((r) => r.models))];
  const models = order.map((model): SetModel => {
    const perRun = runs.filter((r) => r.models.includes(model)).map((r) => ({ run: r.name, results: r.results.filter((x) => x.record.agentModel === model) }));
    const report = modelReport(model, perRun.flatMap((r) => r.results));
    const repeats = perRun.map((r) => {
      const pass = r.results.filter((x) => x.status === "pass").length;
      const n = r.results.filter((x) => x.status === "pass" || x.status === "fail").length;
      return { run: r.run, taskSuccess: { k: pass, n, rate: n ? pass / n : 0, ci: wilson(pass, n) } };
    });
    const rates = repeats.filter((r) => r.taskSuccess.n > 0).map((r) => r.taskSuccess.rate);
    return { model, report, repeats, repeatGap: rates.length > 1 ? Math.max(...rates) - Math.min(...rates) : null };
  });
  return {
    ...spec,
    judge: `${judge.model}, ${judge.rubric}`,
    promptSets: [...new Set(runs.map((r) => r.promptSet))],
    models,
    winner: pickWinner(models.map((m) => ({ model: m.model, taskSuccess: m.report.taskSuccess, policyViolations: m.report.policyViolations }))),
  };
}

/** A set's precomputed file, or null if `npm run eval:sets` hasn't written it yet. */
export function readComparisonSet(id: string, dir = SETS_DIR): ComparisonSet | null {
  const file = join(dir, `${id}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as ComparisonSet) : null;
}
