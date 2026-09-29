import { readFileSync } from "node:fs";
import { z } from "zod";
import { getModelConfig } from "../llm/config.ts";
import { createProvider, type ProviderOptions } from "../llm/factory.ts";
import type { ChatProvider } from "../llm/types.ts";
import type { AgentName } from "../tools/define.ts";
import type { AgentMember } from "./conversation.ts";
import { AGENT_PROMPTS, ROUTER_PROMPT, promptId } from "./prompts.ts";
import { LlmRouter, type Router } from "./router.ts";

/**
 * Which model config each role uses (config/team.json). M4's "Retire / Switch
 * model" action will move this into the database with a history; for now it's
 * a file. MODEL in .env overrides all three roles at once (handy in dev).
 */
const Role = z.object({ model: z.string() });
const TeamFile = z.object({ router: Role, shopping: Role, support: Role });
export type TeamSpec = z.infer<typeof TeamFile>;

const TEAM_PATH = new URL("../../config/team.json", import.meta.url);

export function loadTeamSpec(env = process.env, path: URL | string = TEAM_PATH): TeamSpec {
  const spec = TeamFile.parse(JSON.parse(readFileSync(path, "utf8")));
  if (env.MODEL) return { router: { model: env.MODEL }, shopping: { model: env.MODEL }, support: { model: env.MODEL } };
  return spec;
}

export type Team = {
  router: Router;
  agents: Record<AgentName, AgentMember>;
  /** Recorded on every run: which model and prompt version each role used. */
  meta: Record<string, { model: string; provider: string; prompt: string }>;
};

export type BuildTeamOptions = ProviderOptions & {
  /** Tests: one scripted provider per role (they can share one). */
  fakes?: Partial<Record<"router" | AgentName, ChatProvider>>;
  env?: Record<string, string | undefined>;
};

export function buildTeam(spec: TeamSpec, opts: BuildTeamOptions = {}): Team {
  const env = opts.env ?? process.env;
  const member = (role: "router" | AgentName) => {
    const config = getModelConfig(spec[role].model, undefined, env);
    const fake = opts.fakes?.[role];
    const provider = createProvider(config, { ...opts, client: { ...opts.client, env }, ...(fake ? { fake } : {}) });
    return { config, provider };
  };

  const r = member("router");
  const routerVersion = promptId(ROUTER_PROMPT);
  const agents = {} as Record<AgentName, AgentMember>;
  const meta: Team["meta"] = { router: { model: r.config.id, provider: r.config.provider, prompt: routerVersion } };
  for (const name of ["shopping", "support"] as const) {
    const m = member(name);
    const prompt = AGENT_PROMPTS[name];
    agents[name] = { ...m, prompt, promptVersion: promptId(prompt) };
    meta[name] = { model: m.config.id, provider: m.config.provider, prompt: promptId(prompt) };
  }
  return { router: new LlmRouter(r.provider, r.config, routerVersion), agents, meta };
}
