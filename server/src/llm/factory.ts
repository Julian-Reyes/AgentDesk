import { fileURLToPath } from "node:url";
import { CACHE_MODES, type CacheMode, withCache } from "./cache.ts";
import type { ModelConfig } from "./config.ts";
import { createOpenAICompatibleProvider, type ClientDeps } from "./openai-compatible.ts";
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
};

/** Builds the provider for a model config: the real client wrapped in the record/replay cache. */
export function createProvider(config: ModelConfig, opts: ProviderOptions = {}): ChatProvider {
  if (config.provider === "fake") {
    if (!opts.fake) throw new Error('The "fake" model config needs a scripted FakeProvider (tests only).');
    return opts.fake;
  }
  const client = createOpenAICompatibleProvider(config, opts.client);
  return withCache(client, config, { mode: opts.cacheMode ?? cacheModeFromEnv(), dir: opts.cacheDir ?? DEFAULT_CACHE_DIR });
}

/** Cost in micro-dollars (1e-6 USD), an integer like all our money. Free tiers price at 0, but it's still recorded. */
export function costMicros(config: ModelConfig, usage: { inputTokens: number; outputTokens: number }): number {
  // $X per million tokens is exactly X micro-dollars per token.
  return Math.round(usage.inputTokens * config.pricing.inputPerMTok + usage.outputTokens * config.pricing.outputPerMTok);
}
