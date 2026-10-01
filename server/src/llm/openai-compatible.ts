import type { ModelConfig } from "./config.ts";
import { estimateTokens, type RateLimiter } from "./throttle.ts";
import type { ChatMessage, ChatProvider, ChatRequest, ChatResponse, ToolCall } from "./types.ts";

/**
 * One client for every OpenAI-compatible endpoint (Ollama, Groq, Gemini, Cerebras).
 * It's a single POST to /chat/completions, so plain fetch is enough and no SDK is
 * needed. Keeping the wire format visible here is part of the point.
 */

export class ProviderError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;
  /** Every attempt that failed, including the last one, so the trace keeps them even when the call as a whole fails. */
  failedAttempts: NonNullable<ChatResponse["failedAttempts"]> = [];
  constructor(message: string, status?: number, retryable = false) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.retryable = retryable;
  }
}

export type ClientDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  env?: Record<string, string | undefined>;
  /** Attempts per request, including the first. */
  maxAttempts?: number;
  /** Per-attempt timeout. Local CPU models are slow, so the default is generous. */
  timeoutMs?: number;
  /** Shared rate limiter for this provider+model. Every attempt, including retries, takes a slot. */
  limiter?: RateLimiter;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createOpenAICompatibleProvider(config: ModelConfig, deps: ClientDeps = {}): ChatProvider {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? (() => performance.now());
  const env = deps.env ?? process.env;
  const maxAttempts = deps.maxAttempts ?? 4;
  const timeoutMs = deps.timeoutMs ?? (config.provider === "ollama" ? 10 * 60_000 : 90_000);

  if (!config.baseUrl) throw new Error(`Model config "${config.id}" has no baseUrl`);
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  let apiKey: string | undefined;
  if (config.apiKeyEnv) {
    apiKey = env[config.apiKeyEnv];
    if (!apiKey) throw new Error(`Model "${config.id}" needs ${config.apiKeyEnv} in .env`);
  }

  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      let body = JSON.stringify(toWireRequest(config, req));
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;

      const estimate = estimateTokens(req);
      const failedAttempts: NonNullable<ChatResponse["failedAttempts"]> = [];
      for (let attempt = 1; ; attempt++) {
        const slot = deps.limiter ? await deps.limiter.acquire(estimate) : null;
        const started = now();
        try {
          const res = await doFetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            // 429 = rate limited, 5xx = provider trouble: worth retrying. Other 4xx = our bug: fail fast.
            // Exceptions: a 429 for a *daily* quota won't clear in seconds, so retrying only wastes time;
            // and a 400 that says the *model* produced unparseable output is a sampling glitch, so try again.
            const daily = res.status === 429 && isDailyQuota(text);
            const modelOutput = res.status === 400 && modelOutputErrorCode(text) !== null;
            const retryable = !daily && (res.status === 429 || res.status >= 500 || modelOutput);
            const generation = modelOutput ? failedGeneration(text) : null;
            failedAttempts.push({
              status: res.status,
              ...(errorCode(text) ? { code: errorCode(text)! } : {}),
              message: text.slice(0, 300),
              // The whole thing, not just the first 300 characters: it's what the model actually wrote.
              ...(generation ? { failedGeneration: generation.slice(0, 4000) } : {}),
            });
            // The model wrote the reply, just not as JSON: deliver it instead of throwing it away (round 2).
            const repaired = modelOutput && generation !== null ? repairReplyCall(req, modelOutputErrorCode(text)!, generation) : null;
            if (repaired) {
              return {
                message: { role: "assistant", content: null, toolCalls: [repaired] },
                finishReason: "repaired",
                // A rejected call reports no token counts.
                usage: { inputTokens: 0, outputTokens: 0 },
                latencyMs: Math.round(now() - started),
                repaired: true,
                failedAttempts,
              };
            }
            const err = new ProviderError(
              daily
                ? `${config.id}: daily free-tier quota used up (HTTP 429). Try again tomorrow, or use the replay cache. ${text.slice(0, 300)}`
                : `${config.id}: HTTP ${res.status} ${text.slice(0, 500)}`,
              res.status,
              retryable,
            );
            if (!retryable || attempt >= maxAttempts) throw Object.assign(err, { failedAttempts });
            // A model-output glitch needs a new sample, not a cool-down. The new sample
            // also gets a short note saying what went wrong: identical retries still
            // failed all 4 times in 18 of 57 such calls on dev-1/1b/2.
            if (modelOutput) body = JSON.stringify(toWireRequest(config, withCorrection(req, modelOutputErrorCode(text)!, generation)));
            await sleep(modelOutput ? 500 : retryDelayMs(res.headers.get("retry-after"), attempt, text));
            continue;
          }
          const json = await res.json();
          const parsed = fromWireResponse(json, Math.round(now() - started));
          // Replace the estimate with what the provider actually counted.
          if (slot) slot.tokens = parsed.usage.inputTokens + parsed.usage.outputTokens || slot.tokens;
          return failedAttempts.length ? { ...parsed, failedAttempts } : parsed;
        } catch (e) {
          if (e instanceof ProviderError) throw e;
          const net = describeNetworkError(e, config, url, timeoutMs);
          failedAttempts.push({ message: net.message });
          // The connection itself failed, so the provider never saw this attempt
          // and it used none of the quota: give the rate-limiter slot back.
          if (slot && !net.reachedProvider) deps.limiter!.release(slot);
          // Nothing is listening, or the host doesn't exist: a config problem that
          // retrying won't fix, so fail now instead of after ~14s of backoff.
          if (!net.retryable) throw Object.assign(new ProviderError(`${config.id}: ${net.message}`, undefined, false), { failedAttempts });
          // Timeout or dropped connection: retry, then give up with a clear message.
          if (attempt >= maxAttempts) throw Object.assign(new ProviderError(`${config.id}: ${net.message}`, undefined, true), { failedAttempts });
          await sleep(retryDelayMs(null, attempt));
        }
      }
    },
  };
}

/**
 * Turns Node's unhelpful "fetch failed" into what actually went wrong. The real
 * reason (ECONNREFUSED, ENOTFOUND, ...) is hidden in `error.cause`.
 */
export function describeNetworkError(
  e: unknown,
  config: ModelConfig,
  url: string,
  timeoutMs: number,
): { message: string; retryable: boolean; reachedProvider: boolean } {
  const err = e as Error & { cause?: { code?: string } };
  const host = URL.canParse(url) ? new URL(url).host : url;
  const code = err.cause?.code;
  const hint = config.provider === "ollama" ? " Is Ollama running? Check OLLAMA_BASE_URL in .env." : "";
  // The request may already have been received and counted, so it keeps its rate-limit slot.
  if (err.name === "TimeoutError") {
    return { message: `no response from ${config.provider} at ${host} within ${Math.round(timeoutMs / 1000)}s.`, retryable: true, reachedProvider: true };
  }
  // The rest failed before a connection existed, so the provider never saw the request.
  if (code === "ECONNREFUSED") {
    return { message: `can't connect to ${config.provider} at ${host} (connection refused).${hint}`, retryable: false, reachedProvider: false };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return { message: `can't find host ${host} (DNS lookup failed).${hint}`, retryable: code === "EAI_AGAIN", reachedProvider: false };
  }
  if (code === "UND_ERR_CONNECT_TIMEOUT") {
    return { message: `couldn't connect to ${config.provider} at ${host} (connect timeout).`, retryable: true, reachedProvider: false };
  }
  return { message: `network error talking to ${config.provider} at ${host}: ${err.message}${code ? ` (${code})` : ""}`, retryable: true, reachedProvider: true };
}

/** The provider's error code from an error body, e.g. "tool_use_failed". Gemini wraps the error in an array. */
function errorCode(body: string): string | null {
  try {
    const json = JSON.parse(body);
    const err = (Array.isArray(json) ? json[0] : json)?.error;
    return typeof err?.code === "string" ? err.code : null;
  } catch {
    return null;
  }
}

/**
 * Codes meaning "the model generated output the provider couldn't parse" (Groq:
 * broken tool-call JSON, unparseable output, invalid JSON-mode output). The
 * request was fine; another sample usually works.
 */
export const MODEL_OUTPUT_ERROR_CODES: ReadonlySet<string> = new Set(["tool_use_failed", "output_parse_failed", "json_validate_failed"]);
export function modelOutputErrorCode(body: string): string | null {
  const code = errorCode(body);
  return code && MODEL_OUTPUT_ERROR_CODES.has(code) ? code : null;
}

/** What the model generated when the provider couldn't parse it (Groq's `failed_generation`). */
export function failedGeneration(body: string): string | null {
  try {
    const json = JSON.parse(body);
    const g = (Array.isArray(json) ? json[0] : json)?.error?.failed_generation;
    return typeof g === "string" ? g : null;
  } catch {
    return null;
  }
}

/** `{"name": "x", "arguments": …}` as the model wrote it. `args` is the raw text after "arguments": (null if the shape doesn't match). */
function splitGeneration(generation: string): { name: string; args: string | null } | null {
  const m = /^\s*\{\s*"name"\s*:\s*"([^"]*)"\s*(?:,\s*"arguments"\s*:\s*([\s\S]*))?$/.exec(generation);
  return m ? { name: m[1]!, args: m[2] ?? null } : null;
}

/**
 * gpt-oss-120b's most common broken call (107 of 122 rejected attempts on
 * dev-1/1b/2): it calls `reply` with the message as plain text, not JSON:
 *   {"name": "reply", "arguments": I'm sorry, but the boot can't be returned…}
 * Groq rejects it (tool_use_failed), but the reply is all there. This turns it
 * back into the call the model meant, `reply({"message": "…"})`, so the loop
 * validates it and runs the garbled-reply check like any other reply.
 *
 * Only for `reply`, only when the request offers a `reply` tool, and only when
 * the arguments are plain text (or a JSON string / {"message"} object). An
 * invented tool name, or anything else, returns null and is retried instead.
 */
export function repairReplyCall(req: ChatRequest, code: string, generation: string): ToolCall | null {
  if (code !== "tool_use_failed" || !req.tools?.some((t) => t.name === "reply")) return null;
  const call = splitGeneration(generation);
  if (!call || call.name !== "reply" || call.args === null) return null;
  const text = call.args.trim();
  // The generation usually closes the object it opened: drop that one brace.
  const inner = text.endsWith("}") ? text.slice(0, -1).trimEnd() : text;
  if (text.startsWith("{") || text.startsWith('"')) {
    // JSON after all (the provider choked on something else): use it only if it's clearly the message.
    for (const candidate of [inner, text]) {
      try {
        const parsed: unknown = JSON.parse(candidate);
        const message = typeof parsed === "string" ? parsed : (parsed as { message?: unknown } | null)?.message;
        return typeof message === "string" && message.trim() ? replyCall(message.trim()) : null;
      } catch {
        // try the next reading
      }
    }
    return null;
  }
  // gpt-oss also closes a string it never opened: `… Thanks for understanding."}`
  // (all 20 repairs in dev-3-r1a/r2a). A lone trailing quote is that, not the
  // reply's; one that closes a quoted name ("…called "Pocket Pro"") is paired and kept.
  const plain = inner.endsWith('"') && (inner.match(/"/g) ?? []).length % 2 === 1 ? inner.slice(0, -1).trimEnd() : inner;
  return plain ? replyCall(plain) : null;
}

const replyCall = (message: string): ToolCall => ({ id: "repaired_0", name: "reply", arguments: JSON.stringify({ message }) });

/**
 * The request for the next attempt after the model's output was rejected: the
 * original messages plus one short note on what was wrong. Never cached under
 * this shape: the cache key is the original request.
 */
export function withCorrection(req: ChatRequest, code: string, generation: string | null): ChatRequest {
  const offered = (req.tools ?? []).map((t) => t.name);
  const name = generation ? splitGeneration(generation)?.name : undefined;
  let note: string;
  if (code === "json_validate_failed") note = "Your last answer was not valid JSON. Answer with one JSON object only.";
  else if (name && !offered.includes(name)) note = `Your last response called "${name}", which is not one of your tools. Use only the listed tools.`;
  else if (code === "tool_use_failed") note = "Your last tool call's arguments were not valid JSON. Send the call again with a JSON object as its arguments.";
  else note = "Your last response could not be read. Call one of your tools; don't write your reasoning as the answer.";
  if (offered.includes("reply")) note += ' To answer the customer, call reply with {"message": "…"}.';
  return { ...req, messages: [...req.messages, { role: "user", content: `(${note})` }] };
}

/**
 * Does a 429 body say a per-day limit was hit? Gemini names quotas like
 * "...RequestsPerDayPerProjectPerModel-FreeTier"; Groq says "tokens per day (TPD)"
 * or "requests per day (RPD)". Anything else is treated as a per-minute limit and retried.
 */
export function isDailyQuota(body: string): boolean {
  return /per ?day|\bTPD\b|\bRPD\b|daily/i.test(body);
}

/**
 * How long to wait before retrying. Prefer the provider's own hint: the
 * Retry-After header (Groq), or a retry delay in the error body, which is how
 * Gemini says it ("retryDelay": "2s", "Please retry in 2.29s"). A 1s margin is
 * added to body hints. Otherwise exponential backoff: 2s, 4s, 8s, ... capped at 60s.
 */
export function retryDelayMs(retryAfter: string | null, attempt: number, body = ""): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 120_000);
  }
  const hint = /"retryDelay"\s*:\s*"([\d.]+)s"|retry in ([\d.]+)\s*s/i.exec(body);
  if (hint) return Math.min(Math.ceil((Number(hint[1] ?? hint[2]) + 1) * 1000), 120_000);
  return Math.min(2000 * 2 ** (attempt - 1), 60_000);
}

export function toWireRequest(config: ModelConfig, req: ChatRequest) {
  const { temperature, maxTokens, reasoningEffort } = config.params;
  return {
    model: config.model,
    messages: req.messages.map(toWireMessage),
    ...(req.tools?.length
      ? {
          tools: req.tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }
      : {}),
    ...(req.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    ...(reasoningEffort !== undefined ? { reasoning_effort: reasoningEffort } : {}),
  };
}

function toWireMessage(m: ChatMessage) {
  switch (m.role) {
    case "system":
    case "user":
      return { role: m.role, content: m.content };
    case "assistant":
      return {
        role: "assistant",
        content: m.content,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                ...c.providerData,
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: c.arguments },
              })),
            }
          : {}),
      };
    case "tool":
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
  }
}

type WireToolCall = { id?: string; type?: string; function?: { name?: string; arguments?: unknown }; [extra: string]: unknown };

export function fromWireResponse(json: any, latencyMs: number): ChatResponse {
  const choice = json?.choices?.[0];
  if (!choice?.message) throw new ProviderError(`Malformed response: ${JSON.stringify(json).slice(0, 300)}`);
  const msg = choice.message;

  const toolCalls: ToolCall[] = ((msg.tool_calls ?? []) as WireToolCall[]).map((c, i) => {
    // Anything beyond the standard fields (e.g. Gemini's thought signature) is kept and sent back as-is.
    const { id, type: _type, function: fn, ...providerData } = c;
    return {
      // Some providers omit ids; the loop needs one to pair each result with its call.
      id: id || `call_${i}`,
      name: fn?.name ?? "",
      // Arguments should be a JSON string, but some servers send an object. Normalize to text.
      arguments: typeof fn?.arguments === "string" ? fn.arguments : JSON.stringify(fn?.arguments ?? {}),
      ...(Object.keys(providerData).length ? { providerData } : {}),
    };
  });

  // Providers disagree on the name of the reasoning field.
  const reasoning: unknown = msg.reasoning ?? msg.reasoning_content;

  return {
    message: {
      role: "assistant",
      content: typeof msg.content === "string" && msg.content.length > 0 ? msg.content : null,
      ...(toolCalls.length ? { toolCalls } : {}),
    },
    ...(typeof reasoning === "string" && reasoning.length > 0 ? { reasoning } : {}),
    finishReason: choice.finish_reason ?? "unknown",
    usage: {
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    },
    latencyMs,
  };
}
