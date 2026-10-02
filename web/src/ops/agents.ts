import type { AgentsEval, LiveMetrics, ModelOption, RoleView, TeamChange, TeamRole } from "../lib/api.ts";

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
  return `${model.id} is a paid model ($${model.pricing.inputPerMTok}/M input, $${model.pricing.outputPerMTok}/M output tokens). Every chat it answers spends against the $8/month Groq cap.`;
}

/** The live rows with the role's current model first. */
export const liveRows = (role: Pick<RoleView, "model" | "live">): LiveMetrics[] => [...role.live].sort((a, b) => Number(b.model === role.model) - Number(a.model === role.model));

/**
 * A model's latest eval result for one role, from the default comparison set:
 * routing accuracy for the router, success on that agent's cases otherwise.
 * null when the model wasn't evaluated (never a made-up number).
 */
export function evalFor(ev: AgentsEval, role: TeamRole, model: string): { text: string; label: string } | null {
  const m = ev?.models.find((x) => x.model === model);
  const r = m?.byRole[role];
  if (!ev || !m || !r || !r.n) return null;
  const what = role === "router" ? "routing accuracy" : `${role} cases`;
  return {
    text: `${Math.round(r.rate * 100)}% ${what} (${r.k}/${r.n}, 95% CI ${Math.round(r.ci[0] * 100)}–${Math.round(r.ci[1] * 100)}%); ${m.policyViolations} policy violations`,
    label: `${ev.set.label}${ev.set.split === "dev" ? ", tuned on these cases" : ""}`,
  };
}
