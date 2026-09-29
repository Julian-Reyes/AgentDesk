import { z } from "zod";
import type { AgentName, ToolDef } from "../tools/define.ts";
import { toolsFor } from "../tools/registry.ts";
import type { ToolSchema } from "./types.ts";

/**
 * Converts a tool's Zod argument schema into the JSON Schema the model sees.
 * `io: "input"` describes what the model may send (fields with defaults are
 * optional), not what `run` receives after parsing. The `$schema` key is
 * dropped because some providers reject unknown top-level keys.
 */
export function toToolSchema(tool: ToolDef): ToolSchema {
  const { $schema: _, ...parameters } = z.toJSONSchema(tool.args, { io: "input" }) as Record<string, unknown>;
  return { name: tool.name, description: tool.description, parameters };
}

export const toolSchemasFor = (agent: AgentName): ToolSchema[] => toolsFor(agent).map(toToolSchema);
