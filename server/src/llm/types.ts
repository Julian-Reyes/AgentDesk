/**
 * The chat shape every provider speaks. It mirrors the OpenAI chat-completions
 * format because Gemini, Groq and Ollama all accept it, so one client covers
 * them all. The fake provider (tests) speaks it too.
 */

export type ToolCall = {
  id: string;
  name: string;
  /** Raw JSON text exactly as the model produced it. Parsed (and validated) by the loop, not here. */
  arguments: string;
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

/** A tool as the model sees it: name, description and a JSON Schema for the arguments. */
export type ToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatRequest = {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  /** "json" asks the provider for a JSON object (used by the Router). */
  responseFormat?: "json";
};

export type Usage = { inputTokens: number; outputTokens: number };

export type ChatResponse = {
  message: Extract<ChatMessage, { role: "assistant" }>;
  /** The model's visible reasoning, if the provider returns it (thinking models). Traced, never shown to customers. */
  reasoning?: string;
  finishReason: string;
  usage: Usage;
  latencyMs: number;
  /** True when the response came from the record/replay cache instead of the network. */
  cached?: boolean;
};

export interface ChatProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
}
