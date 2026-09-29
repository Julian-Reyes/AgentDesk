import type { ModelConfig } from "./config.ts";
import type { ChatMessage, ChatProvider, ChatRequest, ChatResponse, ToolCall } from "./types.ts";

/**
 * One client for every OpenAI-compatible endpoint (Ollama, Groq, Gemini, Cerebras).
 * It's a single POST to /chat/completions, so plain fetch is enough and no SDK is
 * needed. Keeping the wire format visible here is part of the point.
 */

export class ProviderError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;
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
      const body = JSON.stringify(toWireRequest(config, req));
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;

      for (let attempt = 1; ; attempt++) {
        const started = now();
        try {
          const res = await doFetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            // 429 = rate limited, 5xx = provider trouble: worth retrying. 4xx = our bug: fail fast.
            const retryable = res.status === 429 || res.status >= 500;
            const err = new ProviderError(`${config.id}: HTTP ${res.status} ${text.slice(0, 500)}`, res.status, retryable);
            if (!retryable || attempt >= maxAttempts) throw err;
            await sleep(retryDelayMs(res.headers.get("retry-after"), attempt));
            continue;
          }
          const json = await res.json();
          return fromWireResponse(json, Math.round(now() - started));
        } catch (e) {
          if (e instanceof ProviderError) throw e;
          // Network error or timeout: retry, then give up with a clear message.
          if (attempt >= maxAttempts) {
            throw new ProviderError(`${config.id}: ${(e as Error).message}`, undefined, true);
          }
          await sleep(retryDelayMs(null, attempt));
        }
      }
    },
  };
}

/** Honor the provider's Retry-After if given; otherwise exponential backoff (2s, 4s, 8s, ... capped at 60s). */
export function retryDelayMs(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 120_000);
  }
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

type WireToolCall = { id?: string; function?: { name?: string; arguments?: unknown } };

export function fromWireResponse(json: any, latencyMs: number): ChatResponse {
  const choice = json?.choices?.[0];
  if (!choice?.message) throw new ProviderError(`Malformed response: ${JSON.stringify(json).slice(0, 300)}`);
  const msg = choice.message;

  const toolCalls: ToolCall[] = ((msg.tool_calls ?? []) as WireToolCall[]).map((c, i) => ({
    // Some providers omit ids; the loop needs one to pair each result with its call.
    id: c.id || `call_${i}`,
    name: c.function?.name ?? "",
    // Arguments should be a JSON string, but some servers send an object. Normalize to text.
    arguments:
      typeof c.function?.arguments === "string" ? c.function.arguments : JSON.stringify(c.function?.arguments ?? {}),
  }));

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
