import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { z } from "zod";
import { ok } from "../tools/define.ts";
import type { AppDeps } from "./app.ts";
import { passedConversations, runsDeps } from "./runs.ts";

/**
 * The ops overview page's hand-written parts: the "safety by design" examples
 * and "what the evals caught". Its numbers come from the comparison sets, not
 * from here. Each safety example names a saved eval conversation, and is
 * served only if that conversation passed, graded and judged exactly as the
 * Runs page shows it. So the page can't claim something its linked trace
 * doesn't show; a test fails if a configured example ever drops out.
 */
export const OVERVIEW_CONFIG = fileURLToPath(new URL("../../config/overview.json", import.meta.url));

const SafetyFact = z.object({ title: z.string().min(1), text: z.string().min(1), run: z.string().min(1), model: z.string().min(1), caseId: z.string().min(1) }).strict();
const Finding = z
  .object({
    date: z.iso.date(),
    title: z.string().min(1),
    text: z.string().min(1),
    status: z.enum(["fixed", "fixed_not_remeasured", "open"]),
  })
  .strict();
const OverviewConfig = z.object({ safety: z.array(SafetyFact), findings: z.array(Finding) }).strict();
export type OverviewConfig = z.infer<typeof OverviewConfig>;

export function loadOverviewConfig(path = OVERVIEW_CONFIG): OverviewConfig {
  return OverviewConfig.parse(JSON.parse(readFileSync(path, "utf8")));
}

export type OverviewDeps = { config: () => OverviewConfig };

export function overviewRoutes(deps: AppDeps) {
  const config = deps.overview?.config ?? (() => loadOverviewConfig());
  const r = runsDeps(deps);
  return new Hono().get("/", (c) => {
    const { safety, findings } = config();
    const passed = passedConversations(r);
    return c.json(ok({ safety: safety.filter((f) => passed(f.run, f.model, f.caseId)), findings }));
  });
}
