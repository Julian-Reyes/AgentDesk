import { z } from "zod";
import type { DbOrTx } from "../db/client.ts";

export type AgentName = "shopping" | "support";

/**
 * What a rule decided, recorded on every tool result that involves one.
 * M2 tracing stores it per step; the dashboard counts it.
 */
export type PolicyDecision = "auto_approved" | "queued_for_approval" | "denied";

export type ToolError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Tools never throw for business outcomes ("coupon expired", "not your order").
 * Those are normal results the model reads and explains to the customer.
 * Exceptions are reserved for real bugs and infrastructure failures.
 */
export type ToolResult<T = unknown> =
  | { ok: true; data: T; policyDecision?: PolicyDecision }
  | { ok: false; error: ToolError; policyDecision?: PolicyDecision };

export type Session = {
  /** Set by the app (login / demo picker), never by the model. null = anonymous. */
  customerId: number | null;
};

export type ToolContext = {
  db: DbOrTx;
  now: Date;
  session: Session;
  /** The conversation (trace) running the tool, stored on approvals so the dashboard can link to it. Unset outside a conversation (CLI, tests). */
  runId?: string;
};

export type ToolDef<A extends z.ZodType = z.ZodType, T = unknown> = {
  name: string;
  description: string;
  /** Which agents get this tool. */
  agents: readonly AgentName[];
  args: A;
  run: (ctx: ToolContext, args: z.infer<A>) => Promise<ToolResult<T>>;
};

/** Result data is model-facing JSON, so it's typed loosely; arguments are typed from the schema. */
export function defineTool<A extends z.ZodType>(def: ToolDef<A, unknown>): ToolDef<A, unknown> {
  return def;
}

export const ok = <T>(data: T, policyDecision?: PolicyDecision): ToolResult<T> =>
  policyDecision ? { ok: true, data, policyDecision } : { ok: true, data };

export const fail = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
  policyDecision?: PolicyDecision,
): ToolResult<never> => {
  const error: ToolError = details ? { code, message, details } : { code, message };
  return policyDecision ? { ok: false, error, policyDecision } : { ok: false, error };
};

/**
 * The single entry point for running a tool. Model-supplied arguments are
 * untrusted input, so they're validated with Zod before `run` ever sees them.
 */
export async function callTool(
  tool: ToolDef,
  ctx: ToolContext,
  rawArgs: unknown,
): Promise<ToolResult> {
  const parsed = tool.args.safeParse(rawArgs);
  if (!parsed.success) {
    return fail("INVALID_ARGS", `Invalid arguments for ${tool.name}.`, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return tool.run(ctx, parsed.data);
}
