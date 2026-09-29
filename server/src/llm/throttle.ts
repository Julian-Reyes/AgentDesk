import type { ChatRequest } from "./types.ts";

/**
 * Keeps real network calls under a provider's free-tier limits, so we wait a
 * little instead of hitting 429s. It sits *inside* the cache, so replayed
 * responses never wait.
 *
 * It tracks the last 60 seconds of calls (a sliding window):
 *   - rpm: at most this many requests in any 60s
 *   - tpm: at most this many tokens in any 60s. Groq's free tier allows 8K
 *     tokens/min, but only 30 requests, and each agent call is a few thousand
 *     tokens, so tokens are the real limit.
 *
 * A request's tokens aren't known until the response arrives, so we reserve an
 * estimate (about 4 characters per token) and replace it with the real count
 * afterwards. If the estimate is off, the client's 429 retry is the backstop.
 *
 * Providers enforce limits per model for the whole account, and the router and
 * both agents may use the same model, so one RateLimiter is shared by every
 * provider instance for that provider+model (see factory.ts).
 *
 * The HTTP client acquires a slot before *every attempt*, retries included:
 * a failed request still counts against the provider's quota. (A first version
 * throttled outside the client, and its hidden retries used up Gemini's
 * 5 requests/minute.)
 */
export type ThrottleLimits = {
  rpm?: number | undefined;
  tpm?: number | undefined;
  /** What this limiter guards, for messages, e.g. "groq/openai/gpt-oss-120b". */
  label?: string;
};

export type ThrottleDeps = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Called when a call has to wait, e.g. to show "waiting 40s: groq/openai/gpt-oss-120b allows 8,000 tokens/min". */
  onWait?: (ms: number, reason: "rpm" | "tpm", info: { label: string; limit: number }) => void;
};

const WINDOW_MS = 60_000;

export function estimateTokens(req: ChatRequest): number {
  return Math.ceil(JSON.stringify({ m: req.messages, t: req.tools ?? [] }).length / 4);
}

/** A reserved slot. Set `tokens` to the real usage once the response arrives. */
export type Reservation = { at: number; tokens: number };

export class RateLimiter {
  private readonly window: Reservation[] = [];
  // Calls decide their start time one at a time, so two concurrent calls can't both see the same free slot.
  private queue: Promise<void> = Promise.resolve();
  private readonly limits: ThrottleLimits;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onWait: ThrottleDeps["onWait"];

  constructor(limits: ThrottleLimits, deps: ThrottleDeps = {}) {
    this.limits = limits;
    this.now = deps.now ?? (() => Date.now());
    this.sleep = deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    this.onWait = deps.onWait;
  }

  /** Waits for a slot, then reserves `estimate` tokens. Returns the reservation, to correct later. */
  acquire(estimate: number): Promise<Reservation> {
    const turn = this.queue.then(async () => {
      await this.waitForSlot(estimate);
      const entry = { at: this.now(), tokens: estimate };
      this.window.push(entry);
      return entry;
    });
    this.queue = turn.then(() => {}, () => {});
    return turn;
  }

  /**
   * Gives a slot back, for an attempt that never reached the provider (the
   * connection itself failed), so it didn't use any of the provider's quota.
   */
  release(reservation: Reservation) {
    const i = this.window.indexOf(reservation);
    if (i >= 0) this.window.splice(i, 1);
  }

  private async waitForSlot(estimate: number) {
    const { rpm, tpm } = this.limits;
    for (;;) {
      const t = this.now();
      while (this.window.length && this.window[0]!.at <= t - WINDOW_MS) this.window.shift();

      let waitUntil = t;
      let reason: "rpm" | "tpm" = "rpm";
      if (rpm && this.window.length >= rpm) waitUntil = this.window[this.window.length - rpm]!.at + WINDOW_MS;

      const used = this.window.reduce((sum, e) => sum + e.tokens, 0);
      // A request bigger than the whole budget can never fit; once the window is empty it goes alone.
      if (tpm && this.window.length > 0 && used + estimate > tpm) {
        let remaining = used;
        // If nothing short of an empty window makes room (an oversized request), wait for the last entry.
        let freeAt = this.window[this.window.length - 1]!.at + WINDOW_MS;
        for (const e of this.window) {
          remaining -= e.tokens; // tokens still in the window after e expires
          if (remaining + estimate <= tpm) {
            freeAt = e.at + WINDOW_MS;
            break;
          }
        }
        if (freeAt > waitUntil) {
          waitUntil = freeAt;
          reason = "tpm";
        }
      }
      if (waitUntil <= t) return;
      this.onWait?.(waitUntil - t, reason, { label: this.limits.label ?? "", limit: (reason === "rpm" ? rpm : tpm) ?? 0 });
      await this.sleep(waitUntil - t);
    }
  }
}

