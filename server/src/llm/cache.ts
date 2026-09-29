import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ModelConfig } from "./config.ts";
import type { ChatProvider, ChatRequest, ChatResponse } from "./types.ts";

/**
 * Record/replay cache. Every response is stored under a hash of the request,
 * so running the same eval again costs nothing and returns identical output.
 *
 *   off     no cache: always call the provider
 *   record  replay hits, call the provider on a miss and store the result
 *   replay  hits only: a miss throws, which guarantees a run costs $0
 *
 * The key covers everything that changes the answer: the config id and the
 * provider (so gpt-oss-120b on Groq and on Cerebras never share entries), the
 * provider's model name, the params, and the full request (messages, tools,
 * response format). It deliberately leaves out baseUrl and API keys: moving
 * Ollama from localhost to the Mac mini doesn't change the model's answers,
 * and keys must never end up in cache files.
 */
export const CACHE_MODES = ["off", "record", "replay"] as const;
export type CacheMode = (typeof CACHE_MODES)[number];

/** Bump when the key or entry format changes, so old entries stop matching instead of being misread. */
const CACHE_FORMAT = 1;

export class CacheMissError extends Error {
  constructor(configId: string, key: string) {
    super(`Cache miss for ${configId} (key ${key.slice(0, 12)}…) in replay mode. Run in "record" mode to fill it.`);
    this.name = "CacheMissError";
  }
}

/** JSON with object keys sorted, so logically equal requests hash the same. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function cacheKey(config: ModelConfig, req: ChatRequest): string {
  const material = {
    format: CACHE_FORMAT,
    configId: config.id,
    provider: config.provider,
    model: config.model,
    params: config.params,
    request: req,
  };
  return createHash("sha256").update(stableStringify(material)).digest("hex");
}

type Entry = {
  key: string;
  configId: string;
  provider: string;
  recordedAt: string;
  request: ChatRequest;
  response: ChatResponse;
};

export type CacheOptions = {
  mode: CacheMode;
  dir: string;
  /** Wall-clock time for the recordedAt stamp (injected for tests). */
  now?: () => Date;
};

export function withCache(inner: ChatProvider, config: ModelConfig, opts: CacheOptions): ChatProvider {
  if (opts.mode === "off") return inner;
  const now = opts.now ?? (() => new Date());
  const pathFor = (key: string) => join(opts.dir, config.provider, key.slice(0, 2), `${key}.json`);

  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const key = cacheKey(config, req);
      const path = pathFor(key);

      let hit: Entry | null = null;
      try {
        hit = JSON.parse(readFileSync(path, "utf8")) as Entry;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      // The original latency is kept: it's what the model actually took, and
      // eval metrics should report that, not the ~0ms of reading a file.
      if (hit) return { ...hit.response, cached: true };

      if (opts.mode === "replay") throw new CacheMissError(config.id, key);

      const response = await inner.chat(req);
      const entry: Entry = { key, configId: config.id, provider: config.provider, recordedAt: now().toISOString(), request: req, response };
      mkdirSync(dirname(path), { recursive: true });
      // Write to a temp file, then rename: a crash mid-write never leaves a half-written entry behind.
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(entry, null, 2));
      renameSync(tmp, path);
      return response;
    },
  };
}
