import { z } from "zod";
import type { ModelConfig } from "../llm/config.ts";
import { costMicros } from "../llm/factory.ts";
import type { ChatMessage, ChatProvider, ChatResponse } from "../llm/types.ts";
import { ROUTER_PROMPT, type Prompt } from "./prompts.ts";
import type { TranscriptEntry } from "./conversation.ts";

/**
 * The Router's contract. Anything that returns a RouteDecision can be the
 * Router: today an LLM, later possibly the ShopRoute-SLM classifier (with this
 * LLM router as its fallback when it's unsure).
 */
export const ROUTES = ["shopping", "support", "clarify", "out_of_scope"] as const;
export const CATEGORIES = [
  "product_info", "comparison", "recommendation", "stock", "pricing_deals",
  "order_status", "shipping", "returns", "refunds", "damaged_item", "account",
  "policy", "out_of_scope", "other",
] as const;
export const URGENCIES = ["low", "normal", "high"] as const;

export type RouteDecision = {
  route: (typeof ROUTES)[number];
  category: (typeof CATEGORIES)[number];
  urgency: (typeof URGENCIES)[number];
  confidence: number;
};

/** What a router call produced, plus what the trace needs to know about it. */
export type RouteResult = {
  decision: RouteDecision;
  /** Customer-facing text for clarify / out_of_scope, if the router wrote one. */
  message?: string;
  /** True when the router's output was unusable and the safe fallback was used. */
  fallback: boolean;
  /** Model calls made (1, or 2 with a retry), for tracing. */
  calls: Array<{ response: ChatResponse; raw: string | null; costMicros: number; error?: string }>;
  modelConfigId?: string;
  provider?: string;
  promptVersion?: string;
};

export interface Router {
  route(transcript: TranscriptEntry[]): Promise<RouteResult>;
}

const LlmOutput = z.object({
  route: z.enum(ROUTES),
  // Models sometimes invent a category; that shouldn't throw away a good route.
  category: z.string().transform((c) => ((CATEGORIES as readonly string[]).includes(c) ? (c as RouteDecision["category"]) : "other")),
  urgency: z.enum(URGENCIES).catch("normal"),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  message: z.string().trim().min(1).max(1000).optional(),
});

/** Pull a JSON object out of a model reply, tolerating ```json fences or stray text around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in the reply");
  return JSON.parse(text.slice(start, end + 1));
}

export const FALLBACK_DECISION: RouteDecision = { route: "clarify", category: "other", urgency: "normal", confidence: 0 };

export class LlmRouter implements Router {
  private readonly provider: ChatProvider;
  private readonly config: ModelConfig;
  private readonly prompt: Prompt;
  private readonly promptVersion: string;

  constructor(provider: ChatProvider, config: ModelConfig, promptVersion: string, prompt: Prompt = ROUTER_PROMPT) {
    this.provider = provider;
    this.config = config;
    this.prompt = prompt;
    this.promptVersion = promptVersion;
  }

  async route(transcript: TranscriptEntry[]): Promise<RouteResult> {
    const messages: ChatMessage[] = [
      { role: "system", content: this.prompt.text },
      ...transcript.map((t): ChatMessage => (t.role === "customer" ? { role: "user", content: t.text } : { role: "assistant", content: t.text })),
    ];
    const calls: RouteResult["calls"] = [];
    const meta = { modelConfigId: this.config.id, provider: this.config.provider, promptVersion: this.promptVersion };

    // Two attempts: if the first reply isn't valid JSON in the right shape, tell
    // the model what was wrong once. After that, fall back to asking the customer
    // to clarify, which is safe: it never sends anyone down the wrong path.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await this.provider.chat({ messages, responseFormat: "json" });
      const raw = response.message.content;
      const cost = costMicros(this.config, response.usage);
      try {
        const out = LlmOutput.parse(extractJson(raw ?? ""));
        calls.push({ response, raw, costMicros: cost });
        const decision: RouteDecision = { route: out.route, category: out.category, urgency: out.urgency, confidence: out.confidence };
        const needsMessage = out.route === "clarify" || out.route === "out_of_scope";
        return { decision, ...(needsMessage && out.message ? { message: out.message } : {}), fallback: false, calls, ...meta };
      } catch (e) {
        const error = e instanceof z.ZodError ? z.prettifyError(e) : (e as Error).message;
        calls.push({ response, raw, costMicros: cost, error });
        messages.push(
          { role: "assistant", content: raw ?? "" },
          { role: "user", content: `That was not valid. ${error}. Reply with only the JSON object described in the instructions.` },
        );
      }
    }
    return { decision: FALLBACK_DECISION, fallback: true, calls, ...meta };
  }
}
