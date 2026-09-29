import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Which model to call, where, and with which settings. Model IDs live in
 * config/models.json, never in code.
 *
 * `provider` is part of a configuration's identity: gpt-oss-120b on Groq and
 * gpt-oss-120b on Cerebras are different configurations (different hardware,
 * quantization and limits), so they get different ids, different cache keys and
 * separate rows in the comparison.
 */
export const PROVIDERS = ["ollama", "groq", "gemini", "cerebras", "fake"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const ModelConfigSchema = z.object({
  /** Stable name used in traces, eval results and the dashboard, e.g. "groq/gpt-oss-120b". */
  id: z.string().min(1),
  provider: z.enum(PROVIDERS),
  /** The provider's own model name, e.g. "openai/gpt-oss-120b". */
  model: z.string().min(1),
  /** May reference env vars shell-style, e.g. "${OLLAMA_BASE_URL:-http://localhost:11434}/v1". */
  baseUrl: z.string().optional(),
  /** Name of the env var holding the API key. The key itself never goes in config. */
  apiKeyEnv: z.string().optional(),
  params: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().optional(),
      /** For thinking models. "none" turns thinking off where the provider supports it. */
      reasoningEffort: z.enum(["none", "low", "medium", "high"]).optional(),
    })
    .default({}),
  /** USD per million tokens. Free tiers are 0, but cost is still computed and recorded. */
  pricing: z
    .object({ inputPerMTok: z.number().min(0).default(0), outputPerMTok: z.number().min(0).default(0) })
    .default({ inputPerMTok: 0, outputPerMTok: 0 }),
  /** Throttle for the eval runner: at most this many requests per minute. */
  rpm: z.number().int().positive().optional(),
  /** Throttle: at most this many tokens (input + output) per minute. */
  tpm: z.number().int().positive().optional(),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

const ConfigFileSchema = z.object({
  /** The model used when nothing else is specified (dev default: local Ollama). */
  default: z.string(),
  models: z.array(ModelConfigSchema).min(1),
});

const CONFIG_PATH = new URL("../../config/models.json", import.meta.url);

type Env = Record<string, string | undefined>;

/**
 * Expands ${VAR} and ${VAR:-default} in a config string. This is how the
 * Ollama URL stays in config while pointing at another machine (the Mac mini)
 * via .env. Trailing slashes on env values are dropped so "${X}/v1" can't
 * become "host//v1".
 */
export function expandEnv(value: string, env: Env): string {
  return value.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g, (_, name: string, fallback?: string) => {
    const v = env[name] || fallback;
    if (v === undefined) throw new Error(`Config references \${${name}}, which is not set and has no default`);
    return v.replace(/\/+$/, "");
  });
}

export function loadModelConfigs(path: URL | string = CONFIG_PATH, env: Env = process.env) {
  const file = ConfigFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const ids = new Set<string>();
  for (const m of file.models) {
    if (ids.has(m.id)) throw new Error(`Duplicate model config id "${m.id}"`);
    ids.add(m.id);
    if (m.baseUrl !== undefined) {
      m.baseUrl = expandEnv(m.baseUrl, env);
      if (!URL.canParse(m.baseUrl)) throw new Error(`Model "${m.id}" has an invalid baseUrl: ${m.baseUrl}`);
    }
  }
  if (!ids.has(file.default)) throw new Error(`Default model "${file.default}" is not in the config`);
  return file;
}

/** Look up a model config by id; falls back to MODEL env var, then the file's default. */
export function getModelConfig(id = process.env.MODEL, path?: URL | string, env: Env = process.env): ModelConfig {
  const file = loadModelConfigs(path, env);
  const wanted = id ?? file.default;
  const found = file.models.find((m) => m.id === wanted);
  if (!found) throw new Error(`Unknown model config "${wanted}". Known: ${file.models.map((m) => m.id).join(", ")}`);
  return found;
}
