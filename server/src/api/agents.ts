import { Hono } from "hono";
import { z } from "zod";
import { liveMetrics } from "../agents/live-metrics.ts";
import { AGENT_PROMPTS, ROUTER_PROMPT, promptId } from "../agents/prompts.ts";
import { changeTeam, readTeam, REASON_MIN_LENGTH } from "../agents/team-store.ts";
import { readTeamFile, type TeamSpec } from "../agents/team.ts";
import { TEAM_ROLES, type TeamRole } from "../db/schema.ts";
import { loadModelConfigs, type ModelConfig } from "../llm/config.ts";
import { fail, ok } from "../tools/define.ts";
import type { AppDeps } from "./app.ts";
import { latestSets, comparisonDeps } from "./comparison.ts";

/**
 * The Agents page: per role, the current model and prompt version, retired
 * combinations, the change history, and how each model did in live
 * conversations over the last 7 days. Switch / retire / reinstate live under
 * /api/admin/agents (admin guard) and always need a reason.
 *
 * Next to the live numbers: each model's latest eval results, from the
 * default comparison set (the first in config/comparison.json). Evals run one
 * model in all three roles, so a role's number is that model's result on the
 * cases for that role (routing accuracy for the router).
 */
export type AgentsDeps = {
  /** config/team.json: the starting team, recorded on first use. */
  teamFile: () => TeamSpec;
  /** config/models.json: what a role can switch to. */
  models: () => ModelConfig[];
  /** MODEL from .env, which overrides the whole team (shown as a warning). */
  envModel: string | undefined;
  /** Whether a team can be built (e.g. its API keys are set); see team-store changeTeam. */
  canBuild?: (spec: TeamSpec) => string | null;
};

const agentsDeps = (deps: AppDeps): AgentsDeps => ({
  teamFile: () => readTeamFile(),
  // The fake provider is for tests only; it can't run a real conversation.
  models: () => loadModelConfigs().models.filter((m) => m.provider !== "fake"),
  envModel: undefined,
  ...deps.agents,
});

const promptFor = (role: TeamRole) => promptId(role === "router" ? ROUTER_PROMPT : AGENT_PROMPTS[role]);

export function agentRoutes(deps: AppDeps) {
  const a = agentsDeps(deps);
  return new Hono().get("/", async (c) => {
    const now = deps.now();
    const { state, history } = await readTeam(deps.db, a.teamFile(), now);
    const models = a.models();
    // All time (Julian, 2026-10-06): a model's record in a role stays visible after it's switched out or retired.
    const live = await liveMetrics(deps.db, null, models);
    const roles = TEAM_ROLES.map((role) => {
      const mine = history.filter((h) => h.role === role);
      const current = state.current[role];
      // When the current model became current: the latest row that changed it.
      // Not for the starting model: its `initial` row only says when the history began.
      const changed = [...mine].reverse().find((h) => h.toModel === current && h.fromModel !== current);
      const since = changed?.action === "initial" ? undefined : changed;
      return {
        role,
        model: current,
        provider: models.find((m) => m.id === current)?.provider ?? null,
        prompt: promptFor(role),
        since: since?.at.toISOString() ?? null,
        retired: state.retired[role],
        history: mine.reverse().map((h) => ({ ...h, at: h.at.toISOString() })),
        live: live.filter((l) => l.role === role),
      };
    });
    // Eval figures per model from the first latest set that has it (Julian, 2026-10-06):
    // test-2 for the models it ran, test-1 for Qwen, which was retired before test-2.
    const sets = latestSets(comparisonDeps(deps));
    const seen = new Set<string>();
    const evalBlock = sets.length
      ? {
          sets: sets.map((s) => ({ id: s.id, label: s.label, split: s.split })),
          models: sets.flatMap((s) =>
            s.models
              .filter(({ model }) => !seen.has(model) && Boolean(seen.add(model)))
              .map(({ model, report: r }) => ({
                model,
                set: s.id,
                taskSuccess: r.taskSuccess,
                policyViolations: r.policyViolations,
                byRole: { router: r.routing, shopping: r.byAgent.shopping ?? null, support: r.byAgent.support ?? null },
                // Per-role figures from the eval conversations; absent in set files written before 2026-10-06.
                roleStats: r.roleStats ?? null,
              })),
          ),
        }
      : null;
    return c.json(
      ok({
        eval: evalBlock,
        envOverride: a.envModel ?? null,
        reasonMinLength: REASON_MIN_LENGTH,
        roles,
        models: models.map((m) => ({ id: m.id, provider: m.provider, pricing: m.pricing, paid: m.pricing.inputPerMTok > 0 || m.pricing.outputPerMTok > 0 })),
      }),
    );
  });
}

const Role = z.enum(TEAM_ROLES);
const Body = z.object({ model: z.string().min(1), replacement: z.string().min(1).optional(), reason: z.string() });

/** Mounted under /api/admin/agents (see app.ts). */
export function agentAdminRoutes(deps: AppDeps) {
  const a = agentsDeps(deps);
  return new Hono().post("/:role/:action{switch|retire|reinstate}", async (c) => {
    const role = Role.safeParse(c.req.param("role"));
    if (!role.success) return c.json(fail("NOT_FOUND", `role must be one of: ${TEAM_ROLES.join(", ")}.`), 404);
    const body = Body.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json(fail("INVALID_BODY", "Send { model, reason, replacement? }."), 400);
    const action = c.req.param("action") as "switch" | "retire" | "reinstate";
    const { model, replacement, reason } = body.data;
    const req = action === "retire" ? { action, role: role.data, model, replacement, reason } : { action, role: role.data, model, reason };
    const result = await changeTeam(deps.db, req, {
      fileSpec: a.teamFile(),
      known: a.models().map((m) => m.id),
      at: deps.now(),
      decidedBy: "admin",
      ...(a.canBuild ? { canBuild: a.canBuild } : {}),
    });
    return result.ok ? c.json(ok({ ...result.data, at: result.data.at.toISOString() })) : c.json(result, 400);
  });
}
