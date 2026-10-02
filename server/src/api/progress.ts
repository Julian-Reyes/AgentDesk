import type { StepRecord, Tracer } from "../tracing/tracer.ts";

/**
 * What the chat widget shows while a turn runs ("Checking tracking…").
 *
 * Labels come from a fixed table keyed by tool name, never from the tool's
 * arguments or results: those are model-written or internal (another
 * customer's order number, a refund decision before the reply explains it),
 * and the customer should only ever read what the agent finally says.
 */
export const TOOL_PROGRESS: Record<string, string> = {
  search_products: "Searching the catalog…",
  get_product: "Looking up product details…",
  check_stock: "Checking stock…",
  get_active_promotions: "Checking current deals…",
  validate_coupon: "Checking the coupon…",
  quote_price: "Calculating the price…",
  find_customer: "Looking up your account…",
  get_order: "Looking up your order…",
  get_tracking: "Checking tracking…",
  check_return_eligibility: "Checking return eligibility…",
  // Neutral on purpose: the tool may queue the request rather than refund.
  issue_refund: "Reviewing the refund request…",
  issue_goodwill_coupon: "Reviewing options…",
  escalate_to_human: "Passing this to our team…",
  get_policy: "Checking our policies…",
};
const FALLBACK = "Working on it…";
const HANDOFF: Record<string, string> = {
  support: "Bringing in our orders & returns assistant…",
  shopping: "Bringing in our shopping assistant…",
};

/** The label for one trace step, or null if the step isn't worth showing. */
export function progressFor(step: StepRecord): string | null {
  if (step.kind === "model_call") {
    // Recorded when the model answers, before its tool calls run: the label
    // describes what's about to happen. reply/handoff aren't work to show.
    const calls = ((step.data.message as { toolCalls?: { name: string }[] } | undefined)?.toolCalls ?? []).filter(
      (c) => c.name !== "reply" && c.name !== "handoff",
    );
    return calls.length ? (TOOL_PROGRESS[calls[0]!.name] ?? FALLBACK) : null;
  }
  if (step.kind === "handoff" && step.data.accepted) {
    const to = (() => {
      try {
        return (JSON.parse(String(step.data.arguments)) as { to?: string }).to;
      } catch {
        return undefined;
      }
    })();
    return (to && HANDOFF[to]) ?? FALLBACK;
  }
  return null;
}

/**
 * Forwards every step to the real tracer (so traces are unchanged), and tells
 * a listener about it after it's stored. The chat API sets the listener for
 * the duration of a turn and streams the labels to the browser.
 */
export class ObservingTracer implements Tracer {
  private readonly inner: Tracer;
  listener: ((step: StepRecord) => void) | null = null;
  constructor(inner: Tracer) {
    this.inner = inner;
  }

  async startRun(meta: Parameters<Tracer["startRun"]>[0]) {
    const run = await this.inner.startRun(meta);
    return {
      id: run.id,
      step: async (step: StepRecord) => {
        await run.step(step);
        this.listener?.(step);
      },
      finish: (summary: Parameters<typeof run.finish>[0]) => run.finish(summary),
    };
  }
}
