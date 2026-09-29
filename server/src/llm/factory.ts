import { fileURLToPath } from "node:url";
import { CACHE_MODES, type CacheMode, withCache } from "./cache.ts";
import type { ModelConfig } from "./config.ts";
import { createOpenAICompatibleProvider, type ClientDeps } from "./openai-compatible.ts";
import { RateLimiter, type ThrottleDeps } from "./throttle.ts";
import type { ChatProvider } from "./types.ts";

export const DEFAULT_CACHE_DIR = fileURLToPath(new URL("../../.llm-cache", import.meta.url));

export function cacheModeFromEnv(env = process.env): CacheMode {
  const mode = env.LLM_CACHE ?? "record";
  if (!(CACHE_MODES as readonly string[]).includes(mode)) {
    throw new Error(`LLM_CACHE must be one of ${CACHE_MODES.join(", ")}; got "${mode}"`);
  }
  return mode as CacheMode;
}

export type ProviderOptions = {
  cacheMode?: CacheMode;
  cacheDir?: string;
  /** Required for the "fake" provider: tests supply the scripted provider. */
  fake?: ChatProvider;
  client?: ClientDeps;
  /** Tests inject a fake clock/sleep; the CLI shows waits. */
  throttle?: ThrottleDeps;
};

/**
 * One rate limiter per provider+model, shared by every provider instance, because
 * providers count limits per model for the whole account (the router and both
 * agents may use the same model).
 */
const limiters = new Map<string, RateLimiter>();
export function limiterFor(config: ModelConfig, deps?: ThrottleDeps): RateLimiter {
  const key = `${config.provider}/${config.model}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new RateLimiter({ rpm: config.rpm, tpm: config.tpm }, deps);
    limiters.set(key, limiter);
  }
  return limiter;
}

/** Builds the provider for a model config: the real client wrapped in the record/replay cache. */
export function createProvider(config: ModelConfig, opts: ProviderOptions = {}): ChatProvider {
  if (config.provider === "fake") {
    if (!opts.fake) throw new Error('The "fake" model config needs a scripted FakeProvider (tests only).');
    return opts.fake;
  }
  // The limiter lives inside the client (every attempt takes a slot), and the
  // client lives inside the cache, so replayed responses never wait.
  const limiter = config.rpm || config.tpm ? limiterFor(config, opts.throttle) : undefined;
  const client = createOpenAICompatibleProvider(config, { ...opts.client, ...(limiter ? { limiter } : {}) });
  return withCache(client, config, { mode: opts.cacheMode ?? cacheModeFromEnv(), dir: opts.cacheDir ?? DEFAULT_CACHE_DIR });
}

/** Cost in micro-dollars (1e-6 USD), an integer like all our money. Free tiers price at 0, but it's still recorded. */
export function costMicros(config: ModelConfig, usage: { inputTokens: number; outputTokens: number }): number {
  // $X per million tokens is exactly X micro-dollars per token.
  return Math.round(usage.inputTokens * config.pricing.inputPerMTok + usage.outputTokens * config.pricing.outputPerMTok);
}
