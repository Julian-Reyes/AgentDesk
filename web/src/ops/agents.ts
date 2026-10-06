import type { AgentsEval, ModelOption, RoleStats, RoleView, TeamChange, TeamRole } from "../lib/api.ts";

/** The Agents page's display logic, as plain functions tested in Node. */

export const ROLE_LABEL = { router: "Router", shopping: "Shopping assistant", support: "Orders & returns" } as const;

/** 1834 → "1.8 s"; 420 → "420 ms". */
export const ms = (v: number | null) => (v === null ? "–" : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`);

/** Micro-dollars → "$0.0123" (small amounts need 4 decimals); 0 → "$0 (free)". */
export const usd = (micros: number | null) => (micros === null ? "–" : micros === 0 ? "$0 (free)" : `$${(micros / 1e6).toFixed(4)}`);

export const pct = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

/** 1234567 → "1.2M". */
export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

/** One history row in words. */
export function describeChange(c: Pick<TeamChange, "action" | "model" | "fromModel" | "toModel">): string {
  switch (c.action) {
    case "initial":
      return `Started with ${c.model}`;
    case "switch":
      return `Switched ${c.fromModel} → ${c.toModel}`;
    case "retire":
      return c.fromModel === c.model ? `Retired ${c.model}, replaced by ${c.toModel}` : `Retired ${c.model}`;
    case "reinstate":
      return `Reinstated ${c.model}`;
  }
}

/** What a role can switch to: not the current model, not retired for this role. */
export const switchTargets = (role: Pick<RoleView, "model" | "retired">, models: ModelOption[]) => models.filter((m) => m.id !== role.model && !role.retired.includes(m.id));

/** What can be retired: anything not already retired. */
export const retireTargets = (role: Pick<RoleView, "retired">, models: ModelOption[]) => models.filter((m) => !role.retired.includes(m.id));

/**
 * The warning shown before confirming a change that makes a paid model
 * current: its chats spend real money against the Groq cap. null for free
 * models.
 */
export function costWarning(model: ModelOption | undefined): string | null {
  if (!model?.paid) return null;
  return `${model.id} is a paid model ($${model.pricing.inputPerMTok}/M input, $${model.pricing.outputPerMTok}/M output tokens). Every chat it answers spends against its provider's monthly cap (Groq $8, Gemini $5).`;
}

/** Where a model stands in a role: on it now, retired from it, switched out of it, or only evaluated. */
export type EvalStatus = "current" | "retired" | "former" | "other";

/**
 * One row of a role's eval table: the model's figures in this role
 * (`roleStats`, counted from the eval conversations in which it played the
 * role), its task success on this role's cases, and which set they come from.
 */
export type EvalRow = { model: string; status: EvalStatus; set: string | null; figures: RoleStats | null; success: string | null };
const STATUS_ORDER: Record<EvalStatus, number> = { current: 0, retired: 1, former: 2, other: 3 };

/**
 * The Agents page shows eval results, not live chats (Julian, 2026-10-06):
 * every evaluated model, plus the current and retired ones even without
 * results (dashes, never invented). Current first, then retired, switched
 * out, others. Each model's figures come from the first latest set that
 * has it (test-2, else test-1).
 */
export function evalRows(role: Pick<RoleView, "role" | "model" | "retired" | "history">, ev: AgentsEval): EvalRow[] {
  const former = role.history.filter((h) => h.action === "switch" && h.fromModel).map((h) => h.fromModel!);
  const ids = [...new Set([role.model, ...role.retired, ...(ev?.models.map((m) => m.model) ?? [])])];
  const status = (m: string): EvalStatus => (m === role.model ? "current" : role.retired.includes(m) ? "retired" : former.includes(m) ? "former" : "other");
  return ids
    .map((model) => {
      const m = ev?.models.find((x) => x.model === model);
      return { model, status: status(model), set: m?.set ?? null, figures: m?.roleStats?.[role.role] ?? null, success: evalCell(ev, role.role, model) };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

/**
 * A table cell: "59% (24/41)", the role's own score; null without results
 * (never invented). Policy violations are counted per model over the whole
 * run, not per role, so they're on the Model comparison page, not here.
 */
export function evalCell(ev: AgentsEval, role: TeamRole, model: string): string | null {
  const m = ev?.models.find((x) => x.model === model);
  const r = m?.byRole[role];
  if (!ev || !m || !r || !r.n) return null;
  return `${Math.round(r.rate * 100)}% (${r.k}/${r.n})`;
}
