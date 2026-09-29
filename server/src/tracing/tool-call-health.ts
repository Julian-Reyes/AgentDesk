import { MODEL_OUTPUT_ERROR_CODES } from "../llm/openai-compatible.ts";

/**
 * How cleanly a model produced tool calls and replies, counted from a run's
 * trace steps and grouped by model config. M3 sums this per model so garbled
 * or rejected tool calls can be compared across models (gpt-oss-120b, for
 * example, often writes `hand-off` for `handoff` or plain text as `reply`'s
 * arguments).
 *
 * Retries hide these problems from the customer, which is why they're counted
 * from the trace rather than from the final replies.
 */
export type ToolCallHealth = {
  /** Model calls made (agent steps and router calls), successful or not. */
  modelCalls: number;
  /** Attempts the provider rejected because the model's own output was unparseable (tool_use_failed, output_parse_failed, json_validate_failed). */
  rejectedByProvider: number;
  /** Tool calls our Zod check rejected (bad JSON or wrong argument shape), including handoffs. */
  invalidArgs: number;
  /** Calls to a tool that doesn't exist or belongs to another agent. */
  unknownTool: number;
  /** Router answers that weren't valid JSON in the expected shape. */
  invalidRouterOutput: number;
  /** Answers given as plain text instead of calling the reply tool. */
  implicitReplies: number;
  /** Replies that contained the reply tool's JSON and had to be unwrapped. */
  unwrappedReplies: number;
};

export const emptyHealth = (): ToolCallHealth => ({
  modelCalls: 0,
  rejectedByProvider: 0,
  invalidArgs: 0,
  unknownTool: 0,
  invalidRouterOutput: 0,
  implicitReplies: 0,
  unwrappedReplies: 0,
});

type TraceStep = {
  kind: string;
  modelConfigId?: string | null | undefined;
  data: Record<string, unknown>;
};

const rejected = (attempts: unknown) =>
  Array.isArray(attempts) ? attempts.filter((a) => MODEL_OUTPUT_ERROR_CODES.has((a as { code?: string }).code ?? "")).length : 0;

/**
 * Counts per model config id. Tool-call, handoff and reply steps don't carry a
 * model id themselves, so they're charged to the model that made the most
 * recent model call (steps must be in trace order).
 */
export function toolCallHealth(steps: TraceStep[]): Record<string, ToolCallHealth> {
  const byModel: Record<string, ToolCallHealth> = {};
  const get = (id: string) => (byModel[id] ??= emptyHealth());
  let lastModel = "unknown";

  for (const step of steps) {
    const d = step.data;
    switch (step.kind) {
      case "router":
      case "model_call": {
        lastModel = step.modelConfigId ?? "unknown";
        const h = get(lastModel);
        h.modelCalls += 1;
        h.rejectedByProvider += rejected(d.failedAttempts);
        if (step.kind === "router" && d.error) h.invalidRouterOutput += 1;
        break;
      }
      case "error": {
        // A model call where every attempt failed: it never produced a model_call step.
        if (!d.failedAttempts) break;
        const h = get(step.modelConfigId ?? lastModel);
        h.modelCalls += 1;
        h.rejectedByProvider += rejected(d.failedAttempts);
        break;
      }
      case "tool_call": {
        const code = (d.result as { error?: { code?: string } } | undefined)?.error?.code;
        if (code === "INVALID_ARGS") get(lastModel).invalidArgs += 1;
        if (code === "UNKNOWN_TOOL") get(lastModel).unknownTool += 1;
        break;
      }
      case "handoff":
        if (d.error === "INVALID_ARGS") get(lastModel).invalidArgs += 1;
        break;
      case "reply":
        // Router replies (clarify / out of scope) come from JSON the router already validated.
        if (d.implicit) get(lastModel).implicitReplies += 1;
        if (d.unwrapped) get(lastModel).unwrappedReplies += 1;
        break;
    }
  }
  return byModel;
}
