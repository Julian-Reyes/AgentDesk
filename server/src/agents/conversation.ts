import { z } from "zod";
import type { DbOrTx } from "../db/client.ts";
import type { Clock } from "../domain/clock.ts";
import type { ModelConfig } from "../llm/config.ts";
import { costMicros } from "../llm/factory.ts";
import { toolSchemasFor } from "../llm/tool-schemas.ts";
import type { ChatMessage, ChatProvider, ToolCall, ToolSchema } from "../llm/types.ts";
import { callTool, type AgentName, type Session, type ToolResult } from "../tools/define.ts";
import { getTool } from "../tools/registry.ts";
import type { RunOutcome, RunTrace, StepRecord, Tracer } from "../tracing/tracer.ts";
import { sessionContext, type Prompt } from "./prompts.ts";
import { unwrapReplyText } from "./reply-text.ts";
import type { Router } from "./router.ts";

/**
 * The hand-written agent loop.
 *
 * A turn: the customer says something → (if no agent owns the conversation yet)
 * the Router picks one → the agent calls the model → the model asks for tools →
 * we run them and feed the results back → ... until the agent calls `reply`.
 *
 * All the business rules are enforced inside the tools. The loop's job is
 * plumbing and guardrails: only the agent's own tools, validated arguments,
 * a step limit, a handoff limit, and a trace of everything.
 */

export type TranscriptEntry = { role: "customer" | "agent"; text: string; agent?: AgentName | "router" };

export type AgentMember = { config: ModelConfig; provider: ChatProvider; prompt: Prompt; promptVersion: string };

export type ConversationDeps = {
  /** Where tools read and write store data (a rolled-back transaction in tests and evals). */
  db: DbOrTx;
  /** Store time for the tools (fixed STORE_DATE), not wall-clock time. */
  clock: Clock;
  /** Set by the app from the login, never by the model. */
  session: Session;
  /** Shown in the agents' system prompt so they know who they're talking to. */
  customer: { name: string; email: string } | null;
  router: Router;
  agents: Record<AgentName, AgentMember>;
  tracer: Tracer;
  source: string;
  team: Record<string, unknown>;
  labels?: Record<string, unknown>;
  limits?: Partial<Limits>;
};

type Limits = {
  /** Model calls per turn before giving up. */
  maxSteps: number;
  /** Handoffs per turn, so two agents can't bounce a customer back and forth forever. */
  maxHandoffs: number;
};
const DEFAULT_LIMITS: Limits = { maxSteps: 8, maxHandoffs: 2 };

type TurnOutput = {
  reply: string;
  /** Who answered: an agent, or the router (clarify / out of scope). */
  answeredBy: AgentName | "router";
  outcome: RunOutcome;
  /**
   * Why a failed turn failed (provider unreachable, step limit, ...). For
   * operators and the CLI only: the customer sees the generic FAILURE_REPLY.
   */
  error?: string;
};

export type TurnResult = TurnOutput & { runId: string };

export const CLARIFY_FALLBACK =
  "Happy to help! Is your question about something you'd like to buy, or about an order you've already placed?";
export const OUT_OF_SCOPE_FALLBACK =
  "I can only help with Larchgrove Supply Co. products, orders, shipping and returns. Is there anything along those lines I can do for you?";
export const FAILURE_REPLY =
  "Sorry, I wasn't able to finish that. Please try again, or ask for a human and a team member will follow up.";

const OTHER: Record<AgentName, AgentName> = { shopping: "support", support: "shopping" };

/** The loop-level handoff tool. It isn't in the M1 registry because it moves the conversation, not store data. */
export function handoffTool(from: AgentName): { schema: ToolSchema; args: z.ZodType<{ to: AgentName; reason: string }> } {
  const to = OTHER[from];
  const args = z.object({ to: z.literal(to), reason: z.string().trim().min(3).max(300) });
  const what = to === "support" ? "existing orders, shipping, returns, refunds or damaged items" : "products, recommendations, stock, prices or coupons for a new purchase";
  return {
    args,
    schema: {
      name: "handoff",
      description: `Transfer the customer to the ${to} agent, for ${what}. Give a short reason; the customer's messages go along with it.`,
      parameters: z.toJSONSchema(args, { io: "input" }) as Record<string, unknown>,
    },
  };
}

const OUTCOME_RANK: Record<RunOutcome, number> = { resolved: 0, approval_needed: 1, escalated: 2, failed: 3 };
const worse = (a: RunOutcome, b: RunOutcome) => (OUTCOME_RANK[b] > OUTCOME_RANK[a] ? b : a);

export class Conversation {
  readonly transcript: TranscriptEntry[] = [];
  private currentAgent: AgentName | null = null;
  /** The current agent's working messages: transcript plus its own tool calls and results (no system prompt). */
  private working: ChatMessage[] = [];
  private handoffNote: string | undefined;
  private turn = 0;
  private outcome: RunOutcome = "resolved";
  private readonly deps: ConversationDeps;
  private readonly limits: Limits;
  private readonly trace: RunTrace;

  private constructor(deps: ConversationDeps, trace: RunTrace) {
    this.deps = deps;
    this.trace = trace;
    this.limits = { ...DEFAULT_LIMITS, ...deps.limits };
  }

  static async start(deps: ConversationDeps): Promise<Conversation> {
    const trace = await deps.tracer.startRun({
      source: deps.source,
      customerId: deps.session.customerId,
      team: deps.team,
      ...(deps.labels ? { labels: deps.labels } : {}),
    });
    return new Conversation(deps, trace);
  }

  get runId() {
    return this.trace.id;
  }
  get agent() {
    return this.currentAgent;
  }

  async send(text: string): Promise<TurnResult> {
    this.turn += 1;
    await this.step({ kind: "user_message", data: { text } });
    this.transcript.push({ role: "customer", text });

    let result: TurnOutput;
    try {
      result = await this.handleTurn(text);
    } catch (e) {
      // Provider down, rate limit exhausted, a bug in a tool... The customer
      // gets an honest failure message; the trace and the caller get the details.
      const message = (e as Error).message;
      const failedAttempts = (e as { failedAttempts?: unknown[] }).failedAttempts;
      const role = this.currentAgent ?? "router";
      // Which model failed, so per-model metrics can count it (from the team metadata recorded on the run).
      const model = (this.deps.team[role] as { model?: string } | undefined)?.model;
      await this.step({
        kind: "error",
        agent: role,
        ...(model ? { modelConfigId: model } : {}),
        data: { message, name: (e as Error).name, ...(failedAttempts?.length ? { failedAttempts } : {}) },
      });
      result = { reply: FAILURE_REPLY, answeredBy: this.currentAgent ?? "router", outcome: "failed", error: message };
    }

    this.transcript.push({ role: "agent", text: result.reply, agent: result.answeredBy });
    this.outcome = worse(this.outcome, result.outcome);
    // Updated after every turn, so an interrupted conversation still has an up-to-date summary.
    await this.trace.finish({ outcome: this.outcome, turns: this.turn });
    return { ...result, runId: this.trace.id };
  }

  private async handleTurn(text: string): Promise<TurnOutput> {
    if (this.currentAgent === null) {
      const routed = await this.deps.router.route(this.transcript);
      for (const [i, call] of routed.calls.entries()) {
        await this.step({
          kind: "router",
          agent: "router",
          ...(routed.modelConfigId ? { modelConfigId: routed.modelConfigId } : {}),
          ...(routed.provider ? { provider: routed.provider } : {}),
          ...(routed.promptVersion ? { promptVersion: routed.promptVersion } : {}),
          data: {
            attempt: i + 1,
            raw: call.raw,
            ...(call.response.failedAttempts ? { failedAttempts: call.response.failedAttempts } : {}),
            ...(call.error ? { error: call.error } : { decision: routed.decision }),
            ...(i === routed.calls.length - 1 ? { fallback: routed.fallback } : {}),
          },
          inputTokens: call.response.usage.inputTokens,
          outputTokens: call.response.usage.outputTokens,
          latencyMs: call.response.latencyMs,
          cached: call.response.cached ?? false,
          costMicros: call.costMicros,
        });
      }
      const { route } = routed.decision;
      if (route === "clarify" || route === "out_of_scope") {
        const reply = routed.message ?? (route === "clarify" ? CLARIFY_FALLBACK : OUT_OF_SCOPE_FALLBACK);
        await this.step({ kind: "reply", agent: "router", data: { message: reply, route } });
        return { reply, answeredBy: "router", outcome: "resolved" };
      }
      this.activate(route);
    } else {
      this.working.push({ role: "user", content: text });
    }
    return this.runAgent();
  }

  /** Give the conversation to an agent. It starts from what the customer has seen, not the previous agent's tool calls. */
  private activate(agent: AgentName, note?: string) {
    this.currentAgent = agent;
    this.handoffNote = note;
    this.working = this.transcript.map((t): ChatMessage => (t.role === "customer" ? { role: "user", content: t.text } : { role: "assistant", content: t.text }));
  }

  private async runAgent(): Promise<TurnOutput & { answeredBy: AgentName }> {
    let turnOutcome: RunOutcome = "resolved";
    let handoffs = 0;

    for (let stepNo = 1; stepNo <= this.limits.maxSteps; stepNo++) {
      const agent = this.currentAgent!;
      const member = this.deps.agents[agent];
      const handoff = handoffTool(agent);
      const context = sessionContext(this.deps.customer, this.handoffNote);

      const response = await member.provider.chat({
        messages: [{ role: "system", content: `${member.prompt.text}\n\n${context}` }, ...this.working],
        tools: [...toolSchemasFor(agent), handoff.schema],
      });
      await this.step({
        kind: "model_call",
        agent,
        modelConfigId: member.config.id,
        provider: member.config.provider,
        promptVersion: member.promptVersion,
        data: {
          step: stepNo,
          context,
          message: response.message,
          ...(response.reasoning ? { reasoning: response.reasoning } : {}),
          ...(response.failedAttempts ? { failedAttempts: response.failedAttempts } : {}),
          finishReason: response.finishReason,
        },
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        latencyMs: response.latencyMs,
        cached: response.cached ?? false,
        costMicros: costMicros(member.config, response.usage),
      });
      this.working.push(response.message);

      const calls = response.message.toolCalls ?? [];
      if (calls.length === 0) {
        const text = response.message.content?.trim();
        if (text) {
          // The model answered in plain text instead of calling reply. Deliver it,
          // but mark it: the evals count how often a model skips the reply tool.
          const clean = unwrapReplyText(text);
          await this.step({ kind: "reply", agent, data: { message: clean.text, implicit: true, ...(clean.unwrapped ? { unwrapped: true, raw: text } : {}) } });
          return { reply: clean.text, answeredBy: agent, outcome: turnOutcome };
        }
        // Empty response: nudge once per step and let the step limit bound it.
        this.working.push({ role: "user", content: "(No reply was sent. Use your tools, then answer the customer with the reply tool.)" });
        continue;
      }

      let finalReply: string | null = null;
      let handoffTo: { to: AgentName; reason: string } | null = null;

      for (const call of calls) {
        // Every tool call must get a result message, or the next request is malformed.
        if (finalReply !== null || handoffTo !== null) {
          this.pushResult(call, { ok: false, error: { code: "SKIPPED", message: "Not run: the turn already ended." } });
          continue;
        }
        if (call.name === "handoff") {
          const parsed = parseArgs(call, handoff.args);
          let rejected: string | undefined;
          if (!parsed.ok) {
            rejected = parsed.error.code;
            this.pushResult(call, parsed);
          } else if (handoffs >= this.limits.maxHandoffs) {
            rejected = "HANDOFF_LIMIT";
            this.pushResult(call, { ok: false, error: { code: "HANDOFF_LIMIT", message: "Too many transfers. Answer the customer yourself or escalate." } });
          } else {
            handoffs += 1;
            handoffTo = parsed.data;
            this.pushResult(call, { ok: true, data: { transferred: true } });
          }
          await this.step({ kind: "handoff", agent, data: { callId: call.id, arguments: call.arguments, accepted: !rejected, ...(rejected ? { error: rejected } : {}) } });
          continue;
        }

        const result = await this.runTool(agent, call);
        this.pushResult(call, result);
        if (result.policyDecision === "queued_for_approval") turnOutcome = worse(turnOutcome, "approval_needed");
        if (call.name === "escalate_to_human" && result.ok) turnOutcome = worse(turnOutcome, "escalated");
        if (call.name === "reply" && result.ok) finalReply = (result.data as { message: string }).message;
      }

      if (finalReply !== null) {
        const clean = unwrapReplyText(finalReply);
        await this.step({ kind: "reply", agent, data: { message: clean.text, ...(clean.unwrapped ? { unwrapped: true, raw: finalReply } : {}) } });
        return { reply: clean.text, answeredBy: agent, outcome: turnOutcome };
      }
      if (handoffTo) {
        this.activate(handoffTo.to, `You are taking over from the ${agent} agent. Their note: ${handoffTo.reason}`);
      }
    }

    const error = `No reply after ${this.limits.maxSteps} model calls (step limit).`;
    await this.step({ kind: "error", agent: this.currentAgent!, data: { message: error } });
    return { reply: FAILURE_REPLY, answeredBy: this.currentAgent!, outcome: "failed", error };
  }

  private async runTool(agent: AgentName, call: ToolCall): Promise<ToolResult> {
    const tool = getTool(call.name);
    let result: ToolResult;
    let threw: string | undefined;
    if (!tool || !tool.agents.includes(agent)) {
      // The allowed-tools list is enforced here, not trusted to the prompt.
      result = { ok: false, error: { code: "UNKNOWN_TOOL", message: `No tool named "${call.name}" is available to you.` } };
    } else {
      let args: unknown;
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        args = undefined;
      }
      if (args === undefined) {
        result = { ok: false, error: { code: "INVALID_ARGS", message: "Arguments were not valid JSON." } };
      } else {
        try {
          result = await callTool(tool, { db: this.deps.db, now: this.deps.clock(), session: this.deps.session }, args);
        } catch (e) {
          // A real bug or infrastructure failure (tools don't throw for business outcomes).
          threw = (e as Error).message;
          result = { ok: false, error: { code: "TOOL_FAILED", message: "The tool failed unexpectedly. Try once more, or escalate to a human." } };
        }
      }
    }
    await this.step({
      kind: "tool_call",
      agent,
      data: { callId: call.id, name: call.name, arguments: call.arguments, result, ...(threw ? { exception: threw } : {}) },
      ...(result.policyDecision ? { policyDecision: result.policyDecision } : {}),
    });
    return result;
  }

  private pushResult(call: ToolCall, result: ToolResult) {
    this.working.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
  }

  private step(s: Omit<StepRecord, "turn">) {
    return this.trace.step({ ...s, turn: this.turn });
  }
}

function parseArgs<T>(call: ToolCall, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: { code: string; message: string } } {
  let raw: unknown;
  try {
    raw = JSON.parse(call.arguments || "{}");
  } catch {
    return { ok: false, error: { code: "INVALID_ARGS", message: "Arguments were not valid JSON." } };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: { code: "INVALID_ARGS", message: z.prettifyError(parsed.error) } };
}

