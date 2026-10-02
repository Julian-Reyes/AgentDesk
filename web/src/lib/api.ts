import { SseParser } from "./sse.ts";

/**
 * The browser side of the API. Every response is `{ ok, data }` or
 * `{ ok: false, error: { code, message } }`, the same shape the tools use.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function unwrap<T>(res: Response): Promise<T> {
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    // not JSON: a proxy error page, the server down...
  }
  if (body?.ok) return body.data;
  if (body && !body.ok) throw new ApiError(body.error.code, body.error.message, res.status);
  throw new ApiError("NETWORK", "We couldn't reach the store. Please try again in a moment.", res.status);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("NETWORK", "We couldn't reach the store. Please check your connection.", 0);
  }
  return unwrap<T>(res);
}

const postJson = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

// ---------- Products ----------

export type Product = {
  id: string;
  name: string;
  category: string;
  listPrice: string;
  currentPrice: string;
  onSale: boolean;
  rating: number;
  description: string;
  availability: "in_stock" | "low_stock" | "out_of_stock";
};

export const getProducts = () => request<{ categories: string[]; products: Product[] }>("/api/products");

// ---------- Chat ----------

export type Persona = { id: string; label: string; tryThis: string[]; signedIn: boolean };
export type AnsweredBy = "shopping" | "support" | "router";
export type Outcome = "resolved" | "approval_needed" | "escalated" | "failed";
export type Reply = { reply: string; answeredBy: AnsweredBy; outcome: Outcome };
export type ChatStarted = { conversationId: string; token: string; persona: { id: string; label: string; signedIn: boolean } };

export const getPersonas = () => request<Persona[]>("/api/chat/personas");
export const startChat = (persona: string) => request<ChatStarted>("/api/chat", postJson({ persona }));

/**
 * Sends one message. Progress labels arrive through `onProgress` while the
 * agents work; the promise resolves with the reply. Refusals before the turn
 * starts (chat ended, wrong token, a turn already running) come back as plain
 * JSON errors and are thrown as ApiError.
 */
export async function sendMessage(chat: { conversationId: string; token: string }, text: string, onProgress: (label: string) => void): Promise<Reply> {
  let res: Response;
  try {
    res = await fetch(`/api/chat/${encodeURIComponent(chat.conversationId)}/messages`, postJson({ text }, { "x-chat-token": chat.token }));
  } catch {
    throw new ApiError("NETWORK", "We couldn't reach the store. Please check your connection.", 0);
  }
  if (!res.ok || !res.headers.get("content-type")?.includes("text/event-stream") || !res.body) return unwrap<never>(res);

  const parser = new SseParser();
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch {
      throw new ApiError("NETWORK", "The connection dropped before the reply arrived. Please try again.", 0);
    }
    if (chunk.done) break;
    for (const e of parser.push(chunk.value)) {
      const data = JSON.parse(e.data) as Record<string, unknown>;
      if (e.event === "progress") onProgress(String(data.label));
      else if (e.event === "reply") return data as Reply;
      else if (e.event === "error") throw new ApiError(String(data.code), String(data.message), 500);
    }
  }
  throw new ApiError("NETWORK", "The connection dropped before the reply arrived. Please try again.", 0);
}

// ---------- Ops dashboard: approvals ----------

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type Approval = {
  id: number;
  kind: "refund" | "goodwill_coupon";
  status: ApprovalStatus;
  customer: { id: number; name: string };
  orderNumber: number | null;
  amountCents: number | null;
  percent: number | null;
  item: string | null;
  refundReason: string | null;
  agentNote: string | null;
  queuedBecause: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  runId: string | null;
  /** For rejections from a conversation: has `npm run eval:draft-from-rejections` written its draft case? */
  draftCase: "written" | "not_yet" | null;
};

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export const getApprovals = (status?: ApprovalStatus) =>
  request<{ approvals: Approval[] }>(`/api/approvals${status ? `?status=${status}` : ""}`).then((d) => d.approvals);

/** Checks a pasted admin token (401/403 come back as ApiError). */
export const checkAdmin = (token: string) => request<{ admin: true }>("/api/admin/check", { headers: bearer(token) });

export const decideApproval = (id: number, action: "approve" | "reject", note: string, token: string) =>
  request<{ id: number; status: ApprovalStatus }>(`/api/admin/approvals/${id}/${action}`, postJson(note.trim() ? { note } : {}, bearer(token)));

// ---------- Ops dashboard: agents ----------

export type TeamRole = "router" | "shopping" | "support";
export type TeamAction = "initial" | "switch" | "retire" | "reinstate";
export type TeamChange = { id: number; role: TeamRole; action: TeamAction; model: string; fromModel: string | null; toModel: string; reason: string; decidedBy: string; at: string };
export type LiveMetrics = {
  role: TeamRole;
  model: string;
  conversations: number;
  outcomes: Record<Outcome, number>;
  failureRate: number | null;
  calls: number;
  latencyMs: { p50: number | null; p95: number | null };
  inputTokens: number;
  outputTokens: number;
  costMicros: number | null;
};
export type RoleView = { role: TeamRole; model: string; provider: string | null; prompt: string; since: string | null; retired: string[]; history: TeamChange[]; live: LiveMetrics[] };
export type ModelOption = { id: string; provider: string; paid: boolean; pricing: { inputPerMTok: number; outputPerMTok: number } };
export type AgentsView = { eval: AgentsEval; envOverride: string | null; liveWindowDays: number; reasonMinLength: number; roles: RoleView[]; models: ModelOption[] };

export const getAgents = () => request<AgentsView>("/api/agents");

export const changeTeam = (role: TeamRole, action: "switch" | "retire" | "reinstate", body: { model: string; reason: string; replacement?: string }, token: string) =>
  request<TeamChange>(`/api/admin/agents/${role}/${action}`, postJson(body, bearer(token)));

// ---------- Ops dashboard: model comparison ----------

export type Rate = { k: number; n: number; rate: number; ci: [number, number] };
export type Mean = { mean: number; ci: [number, number]; n: number };
/** The fields of the server's ModelReport the page shows. */
export type ModelReport = {
  model: string;
  conversations: number;
  statuses: Record<"pass" | "fail" | "script_mismatch" | "judge_pending" | "judge_failed" | "provider_error", number>;
  taskSuccess: Rate;
  routing: Rate;
  byAgent: Partial<Record<"router" | "shopping" | "support", Rate>>;
  policyViolations: number;
  groundingViolations: number;
  conversationsWithGrounding: Rate;
  escalation: Rate;
  turnLatencyMs: { p50: number | null; p95: number | null };
  costUsd: number;
  health: { rejectedByProvider: number; invalidArgs: number; unknownTool: number; garbledDelivered: number };
  quality: { tone: Mean | null; clarity: Mean | null; helpfulness: Mean | null; lowShare: Rate } | null;
};
export type Winner = { kind: "none"; reason: string } | { kind: "significant" | "not_significant"; model: string; runnerUp: string | null };
export type ComparisonSet = {
  id: string;
  label: string;
  split: "dev" | "test";
  runs: string[];
  judge: string;
  promptSets: string[];
  models: { model: string; report: ModelReport; repeats: { run: string; taskSuccess: Rate }[]; repeatGap: number | null }[];
  winner: Winner;
};
export type ComparisonList = { sets: { id: string; label: string; split: "dev" | "test"; runs: string[]; generated: boolean }[]; default: string | null };

export const getComparisonList = () => request<ComparisonList>("/api/comparison");
export const getComparisonSet = (id: string) => request<ComparisonSet>(`/api/comparison/${encodeURIComponent(id)}`);

/** The default comparison set's results per model, shown on the Agents page. */
export type AgentsEval = {
  set: { id: string; label: string; split: "dev" | "test" };
  models: { model: string; taskSuccess: Rate; policyViolations: number; byRole: Record<TeamRole, Rate | null> }[];
} | null;
