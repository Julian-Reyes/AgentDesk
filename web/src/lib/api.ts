import { SseParser } from "./sse.ts";
import { IS_STATIC, READ_ONLY_MESSAGE, SITE_ROOT, snapshotUrl, type SnapshotMeta } from "./static.ts";

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
  if (IS_STATIC) return snapshot<T>(path, init);
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("NETWORK", "We couldn't reach the store. Please check your connection.", 0);
  }
  return unwrap<T>(res);
}

/** Static mode: read the exported response; refuse anything that isn't a plain GET. */
async function snapshot<T>(path: string, init?: RequestInit): Promise<T> {
  if (init?.method && init.method !== "GET") throw new ApiError("READ_ONLY", READ_ONLY_MESSAGE, 0);
  let res: Response;
  try {
    res = await fetch(snapshotUrl(path));
  } catch {
    throw new ApiError("NETWORK", "We couldn't load this page's data. Please check your connection.", 0);
  }
  // A missing file is a 404 on GitHub Pages, but some hosts answer with the site's HTML page instead.
  if (res.status === 404 || !res.headers.get("content-type")?.includes("json")) throw new ApiError("NOT_FOUND", "This isn't part of the snapshot.", 404);
  return unwrap<T>(res);
}

/** The snapshot's date and commit (static mode only). */
export async function getSnapshotMeta(): Promise<SnapshotMeta | null> {
  if (!IS_STATIC) return null;
  try {
    const res = await fetch(`${SITE_ROOT}data/meta.json`);
    return res.ok ? ((await res.json()) as SnapshotMeta) : null;
  } catch {
    return null;
  }
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
  if (IS_STATIC) throw new ApiError("READ_ONLY", READ_ONLY_MESSAGE, 0);
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
  /** Public site only: a made-up example (server/src/seed/demo-approvals.ts), not a real request. */
  example?: boolean;
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
export type AgentsView = { eval: AgentsEval; envOverride: string | null; reasonMinLength: number; roles: RoleView[]; models: ModelOption[] };

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
/** latest: the sets behind the latest results, in priority order (config/comparison.json `latest`). */
export type ComparisonList = { sets: { id: string; label: string; split: "dev" | "test"; runs: string[]; generated: boolean }[]; default: string | null; latest: string[] };

export const getComparisonList = () => request<ComparisonList>("/api/comparison");
export const getComparisonSet = (id: string) => request<ComparisonSet>(`/api/comparison/${encodeURIComponent(id)}`);

/** The default comparison set's results per model, shown on the Agents page. */
/** The Agents page's eval figures: per model, from the first configured set that has it (server: api/agents.ts). */
export type AgentsEval = {
  sets: { id: string; label: string; split: "dev" | "test" }[];
  models: { model: string; set: string; taskSuccess: Rate; policyViolations: number; byRole: Record<TeamRole, Rate | null>; roleStats?: Record<TeamRole, RoleStats | null> | null }[];
} | null;
/** A role's figures in the eval conversations, computed like LiveMetrics (server: evals/runner/report.ts roleStats). */
export type RoleStats = Omit<LiveMetrics, "role" | "model">;

// ---------- Ops dashboard: overview ----------

/** A "safety by design" example; the server only sends ones whose conversation passed. */
export type SafetyFact = { title: string; text: string; run: string; model: string; caseId: string };
export type Finding = { date: string; title: string; text: string; status: "fixed" | "fixed_not_remeasured" | "open" };
export const getOverview = () => request<{ safety: SafetyFact[]; findings: Finding[] }>("/api/overview");

// ---------- Public site: chat recordings ----------

/** A saved eval conversation the static storefront plays back (server/config/replays.json). */
export type Replay = {
  title: string;
  run: string;
  model: string;
  caseId: string;
  /** The signed-in demo customer, or null for a visitor who isn't signed in. */
  customerName: string | null;
  turns: { customer: string; progress: string[]; reply: string; answeredBy: AnsweredBy }[];
};
export const getReplays = () => request<{ replays: Replay[] }>("/api/replays");

// ---------- Ops dashboard: runs ----------

/** One trace step, as the live trace (database) and saved eval runs both store it. */
export type TraceStep = {
  seq?: number;
  turn: number;
  kind: "user_message" | "router" | "model_call" | "tool_call" | "handoff" | "reply" | "reply_rejected" | "error";
  agent?: string | null;
  modelConfigId?: string | null;
  promptVersion?: string | null;
  data: Record<string, unknown>;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  cached?: boolean | null;
  policyDecision?: string | null;
  at?: string;
};
export type LiveRun = {
  id: string;
  source: string;
  customerId: number | null;
  labels: Record<string, unknown>;
  team: Record<string, { model?: string }>;
  startedAt: string;
  endedAt: string | null;
  outcome: Outcome | null;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  firstMessage?: string | null;
};
export type EvalStatus = "pass" | "fail" | "script_mismatch" | "judge_pending" | "judge_failed" | "provider_error";
/** The judge a run is shown with; legacy = an older judge setup (pilot-1: Gemma 4 31B, rubric@1), not comparable with later runs. */
export type RunJudge = { model: string; rubric: string; legacy: boolean };
export type EvalRunInfo = { name: string; split: string; promptSet: string | null; models: string[]; cases: number; createdAt: string; judge: RunJudge };
export type EvalConversationRow = {
  caseId: string;
  type: string;
  model: string;
  status: EvalStatus;
  outcome: Outcome;
  failedChecks: { id: string; severity: "policy" | "grounding" | "task" }[];
  judgeNo: string[];
  policyViolations: number;
  groundingViolations: number;
};
export type JudgeAnswer = { id: string; answer: boolean; why: string; votes?: boolean[]; contradictions?: number[] };
export type EvalConversation = {
  run: string;
  status: EvalStatus;
  judge: RunJudge;
  case: { id: string; type: string; split: string; why: string; customer?: string | null; turns: { customer: string; assumes?: string }[]; expect: Record<string, unknown> };
  model: string;
  outcome: Outcome;
  steps: TraceStep[];
  grade: {
    checks: { id: string; label: string; pass: boolean; severity: "policy" | "grounding" | "task"; detail?: string }[];
    counts: { policyViolations: number; groundingViolations: number; forbiddenAttempts: number; failedChecks: number };
    judgeQuestions: ({ id: string; kind: "judge_check"; statement: string } | { id: string; kind: "script_fit"; turn: number; assumes: string })[];
  };
  verdict: { ok: boolean; error: string | null; output: { replies: { reply: number; tone: number; clarity: number; helpfulness: number; why: string }[]; checks: JudgeAnswer[]; scriptFit: JudgeAnswer[] } | null } | null;
  providerError: string | null;
};

/** Live traces are admin-only: they hold what visitors typed (Julian, 2026-10-02). */
export const getLiveRuns = (q: { source?: string; outcome?: string; model?: string; before?: string }, token: string) => {
  const params = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => !!e[1]));
  return request<{ runs: LiveRun[]; next: string | null }>(`/api/admin/runs${params.size ? `?${params}` : ""}`, { headers: bearer(token) });
};
export const getLiveRun = (id: string, token: string) =>
  request<{ run: LiveRun; steps: TraceStep[] }>(`/api/admin/runs/${encodeURIComponent(id)}`, { headers: bearer(token) });
export const getEvalRuns = () => request<{ runs: EvalRunInfo[]; judge: { model: string; rubric: string } }>("/api/eval-runs");
export const getEvalConversations = (run: string) =>
  request<{ run: string; models: string[]; judge: RunJudge; conversations: EvalConversationRow[] }>(`/api/eval-runs/${encodeURIComponent(run)}/conversations`);
export const getEvalConversation = (run: string, model: string, caseId: string) =>
  request<EvalConversation>(`/api/eval-runs/${encodeURIComponent(run)}/conversation?${new URLSearchParams({ model, case: caseId })}`);
