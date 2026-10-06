import { Hono } from "hono";
import { loadAgentsPageSetIds, loadComparisonConfig, readComparisonSet, SETS_DIR, type ComparisonSet, type ComparisonSetSpec } from "../evals/runner/comparison-sets.ts";
import { fail, ok } from "../tools/define.ts";
import type { AppDeps } from "./app.ts";

/**
 * The Model comparison page. It serves the files `npm run eval:sets` wrote,
 * never grading anything per request, so the page shows exactly the committed
 * numbers. Public and read-only.
 */
export type ComparisonDeps = { config: () => ComparisonSetSpec[]; dir: string; agentsPage?: () => string[] };

export const comparisonDeps = (deps: AppDeps): ComparisonDeps => ({ config: () => loadComparisonConfig(), dir: SETS_DIR, agentsPage: () => loadAgentsPageSetIds(), ...deps.comparison });

/** The Agents page's sets, in priority order (config agentsPage; else the default set); ones not generated yet are skipped. */
export function agentsPageSets(c: ComparisonDeps): ComparisonSet[] {
  const ids = c.agentsPage?.() ?? (c.config()[0] ? [c.config()[0]!.id] : []);
  return ids.map((id) => readComparisonSet(id, c.dir)).filter((s): s is ComparisonSet => s !== null);
}

/** The default set (first in config/comparison.json), for the Agents page; null if it hasn't been generated. */
export function defaultSet(c: ComparisonDeps): ComparisonSet | null {
  const first = c.config()[0];
  return first ? readComparisonSet(first.id, c.dir) : null;
}

export function comparisonRoutes(deps: AppDeps) {
  const c = comparisonDeps(deps);
  return new Hono()
    .get("/", (ctx) => {
      const sets = c.config().map((s) => ({ id: s.id, label: s.label, split: s.split, runs: s.runs, generated: readComparisonSet(s.id, c.dir) !== null }));
      return ctx.json(ok({ sets, default: sets[0]?.id ?? null }));
    })
    .get("/:id", (ctx) => {
      const id = ctx.req.param("id");
      if (!c.config().some((s) => s.id === id)) return ctx.json(fail("NOT_FOUND", `No comparison set "${id}".`), 404);
      const set = readComparisonSet(id, c.dir);
      if (!set) return ctx.json(fail("NOT_GENERATED", `Comparison set "${id}" hasn't been generated yet (npm run eval:sets).`), 404);
      return ctx.json(ok(set));
    });
}
