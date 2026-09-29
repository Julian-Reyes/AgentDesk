import type { ChatProvider, ChatRequest, ChatResponse, ToolCall } from "./types.ts";

/**
 * A provider that never touches the network. Tests hand it a script of
 * responses; it plays them back in order and records every request, so a test
 * can assert both what the loop did and exactly what it sent to the "model".
 *
 * A script entry can be a fixed response or a function of the request, for
 * cases where the reply depends on what the loop sent (e.g. echoing an id).
 */
export type FakeStep = FakeResponse | ((req: ChatRequest) => FakeResponse) | Error;
export type FakeResponse = Partial<Omit<ChatResponse, "message">> & { message: ChatResponse["message"] };

export class FakeProvider implements ChatProvider {
  readonly requests: ChatRequest[] = [];
  private readonly script: FakeStep[];

  constructor(script: FakeStep[] = []) {
    this.script = [...script];
  }

  /** Append more responses (e.g. for the next conversation turn). */
  push(...steps: FakeStep[]) {
    this.script.push(...steps);
  }

  get remaining() {
    return this.script.length;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // Deep-copy so later mutation of the loop's message array doesn't rewrite history.
    this.requests.push(structuredClone(req));
    const step = this.script.shift();
    if (step === undefined) throw new Error(`FakeProvider: script exhausted after ${this.requests.length - 1} responses`);
    if (step instanceof Error) throw step;
    const r = typeof step === "function" ? step(req) : step;
    return {
      finishReason: r.message.toolCalls?.length ? "tool_calls" : "stop",
      usage: { inputTokens: 100, outputTokens: 20 },
      latencyMs: 5,
      ...r,
    };
  }
}

let nextId = 0;

/** Helpers to write scripts tersely. */
export const fake = {
  /** The model calls one or more tools. */
  tools(...calls: Array<[name: string, args: unknown]>): FakeResponse {
    const toolCalls: ToolCall[] = calls.map(([name, args]) => ({
      id: `fake_${++nextId}`,
      name,
      arguments: typeof args === "string" ? args : JSON.stringify(args),
    }));
    return { message: { role: "assistant", content: null, toolCalls } };
  },
  /** Shorthand for the model calling the reply tool. */
  reply(message: string): FakeResponse {
    return fake.tools(["reply", { message }]);
  },
  /** Plain text with no tool call (some models answer this way instead of using reply). */
  text(content: string): FakeResponse {
    return { message: { role: "assistant", content } };
  },
  /** A JSON body, as the Router returns. */
  json(value: unknown): FakeResponse {
    return { message: { role: "assistant", content: JSON.stringify(value) } };
  },
};
