import type { AgentName, ToolDef } from "./define.ts";
import { SHARED_TOOLS } from "./shared.ts";
import { SHOPPING_TOOLS } from "./shopping.ts";
import { SUPPORT_TOOLS } from "./support.ts";

export const ALL_TOOLS: ToolDef[] = [...SHOPPING_TOOLS, ...SUPPORT_TOOLS, ...SHARED_TOOLS] as ToolDef[];

const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));
if (byName.size !== ALL_TOOLS.length) throw new Error("Duplicate tool name in registry");

export const getTool = (name: string) => byName.get(name);

/** The tools a given agent is allowed to call. Enforced here, not by the prompt. */
export const toolsFor = (agent: AgentName) => ALL_TOOLS.filter((t) => t.agents.includes(agent));
