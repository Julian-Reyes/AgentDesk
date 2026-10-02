import type { TraceStep } from "../lib/api.ts";

/**
 * How the trace timeline shows each step, as a plain function tested in
 * Node. The raw step is always one click away (collapsed JSON), so this only
 * picks what to say at a glance.
 */
export type StepView = {
  tone: "customer" | "router" | "model" | "tool" | "reply" | "warn" | "error";
  title: string;
  /** Main text (a message, or the tool's arguments and result). */
  body: string | null;
  /** Small facts: model, tokens, latency, cached, policy decision. */
  meta: string[];
  /** Things worth noticing: a denied tool call, a held-back reply, a fallback. */
  flags: string[];
};

const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : JSON.stringify(v));

function parseArgs(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** "1.2 s"; "420 ms". */
const ms = (v: number) => (v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`);

function callMeta(st: TraceStep): string[] {
  const out: string[] = [];
  if (st.modelConfigId) out.push(st.modelConfigId);
  if (st.inputTokens != null || st.outputTokens != null) out.push(`${st.inputTokens ?? 0} in / ${st.outputTokens ?? 0} out tokens`);
  if (st.latencyMs != null) out.push(ms(st.latencyMs));
  if (st.cached) out.push("cached");
  return out;
}

export function describeStep(st: TraceStep): StepView {
  const d = st.data;
  const agent = st.agent ?? "";
  switch (st.kind) {
    case "user_message":
      return { tone: "customer", title: "Customer", body: str(d.text), meta: [], flags: [] };

    case "router": {
      const decision = d.decision as { route?: string; category?: string; urgency?: string; confidence?: number } | undefined;
      const flags = [d.error ? `invalid output: ${str(d.error)}` : "", d.fallback ? "fell back to asking the customer to clarify" : ""].filter(Boolean);
      const title = decision ? `Router → ${decision.route}` : `Router (attempt ${str(d.attempt)})`;
      const facts = decision ? [`confidence ${Math.round((decision.confidence ?? 0) * 100)}%`, `${decision.category} · ${decision.urgency}`] : [];
      return { tone: flags.length ? "warn" : "router", title, body: null, meta: [...facts, ...callMeta(st)], flags };
    }

    case "model_call": {
      const msg = d.message as { content?: string | null; toolCalls?: { name: string }[] } | undefined;
      const asks = msg?.toolCalls?.map((t) => t.name) ?? [];
      const failed = Array.isArray(d.failedAttempts) ? d.failedAttempts.length : 0;
      const flags = [failed ? `${failed} failed attempt${failed > 1 ? "s" : ""} before this` : "", d.repaired ? "reply rebuilt from a rejected call" : ""].filter(Boolean);
      return {
        tone: "model",
        title: `${agent} model call${asks.length ? ` → ${asks.join(", ")}` : ""}`,
        body: msg?.content ? msg.content : null,
        meta: callMeta(st),
        flags,
      };
    }

    case "tool_call": {
      const result = d.result as { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } } | undefined;
      const args = parseArgs(d.arguments);
      const outcome = result?.ok ? "ok" : `${result?.error?.code ?? "error"}: ${result?.error?.message ?? ""}`;
      const flags = [st.policyDecision === "denied" ? "denied by the rules" : "", st.policyDecision === "queued_for_approval" ? "sent for approval" : "", d.exception ? `threw: ${str(d.exception)}` : ""].filter(Boolean);
      return {
        tone: result?.ok ? "tool" : "warn",
        title: `${str(d.name)} (${outcome.length > 80 ? `${outcome.slice(0, 80)}…` : outcome})`,
        body: `args ${JSON.stringify(args)}`,
        meta: st.policyDecision ? [st.policyDecision] : [],
        flags,
      };
    }

    case "handoff": {
      const args = parseArgs(d.arguments) as { to?: string; reason?: string } | string;
      const to = typeof args === "object" && args ? args.to : undefined;
      const reason = typeof args === "object" && args ? args.reason : str(args);
      return { tone: d.accepted ? "router" : "warn", title: `Handoff ${agent} → ${to ?? "?"}${d.accepted ? "" : " (refused)"}`, body: reason ?? null, meta: [], flags: d.error ? [str(d.error)] : [] };
    }

    case "reply":
      return {
        tone: "reply",
        title: `Reply (${agent || "router"})`,
        body: str(d.message),
        meta: [],
        flags: [d.implicit ? "sent as plain text, not with the reply tool" : "", d.unwrapped ? "unwrapped from JSON" : ""].filter(Boolean),
      };

    case "reply_rejected":
      return { tone: "warn", title: "Reply held back", body: str(d.message), meta: [], flags: [`${str(d.reason)}${d.detail ? `: ${str(d.detail)}` : ""}`, d.retry ? "retried" : "no retry left"] };

    case "error":
      return { tone: "error", title: "Error", body: str(d.message), meta: [], flags: [] };
  }
}

/** Steps grouped by turn, in order, for the timeline headings. */
export function byTurn(steps: TraceStep[]): { turn: number; steps: TraceStep[] }[] {
  const out: { turn: number; steps: TraceStep[] }[] = [];
  for (const st of steps) {
    const last = out.at(-1);
    if (last && last.turn === st.turn) last.steps.push(st);
    else out.push({ turn: st.turn, steps: [st] });
  }
  return out;
}
