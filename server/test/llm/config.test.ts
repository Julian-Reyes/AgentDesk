import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandEnv, getJudgeIds, getModelConfig, loadModelConfigs, otherJudge } from "../../src/llm/config.ts";

function configFile(content: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "models-"));
  const path = join(dir, "models.json");
  writeFileSync(path, JSON.stringify(content));
  return path;
}

describe("expandEnv", () => {
  it("uses the env value when set, dropping trailing slashes", () => {
    expect(expandEnv("${OLLAMA_BASE_URL:-http://localhost:11434}/v1", { OLLAMA_BASE_URL: "http://192.168.1.50:11434/" }))
      .toBe("http://192.168.1.50:11434/v1");
  });

  it("falls back to the default when unset or empty", () => {
    expect(expandEnv("${OLLAMA_BASE_URL:-http://localhost:11434}/v1", {})).toBe("http://localhost:11434/v1");
    expect(expandEnv("${OLLAMA_BASE_URL:-http://localhost:11434}/v1", { OLLAMA_BASE_URL: "" })).toBe("http://localhost:11434/v1");
  });

  it("throws when a variable has no value and no default", () => {
    expect(() => expandEnv("${NOPE}/v1", {})).toThrow(/NOPE/);
  });
});

describe("model config file", () => {
  it("the real config loads, has the default, and every id is unique", () => {
    const file = loadModelConfigs(undefined, {});
    expect(file.models.map((m) => m.id)).toContain(file.default);
    for (const m of file.models.filter((m) => m.provider === "ollama")) {
      expect(m.baseUrl).toBe("http://localhost:11434/v1");
    }
  });

  it("ollama configs follow OLLAMA_BASE_URL", () => {
    const m = getModelConfig("ollama/qwen3.5-4b", undefined, { OLLAMA_BASE_URL: "http://10.0.0.7:11434" });
    expect(m.baseUrl).toBe("http://10.0.0.7:11434/v1");
  });

  it("config ids include the provider, so the same model on two providers stays separate", () => {
    const file = loadModelConfigs(undefined, {});
    for (const m of file.models.filter((m) => m.provider !== "fake")) {
      expect(m.id.startsWith(`${m.provider}/`)).toBe(true);
    }
  });

  it("rejects duplicate ids, a missing default, and bad URLs", () => {
    const base = { id: "a", provider: "ollama", model: "x", baseUrl: "http://h/v1" };
    expect(() => loadModelConfigs(configFile({ default: "a", models: [base, base] }), {})).toThrow(/Duplicate/);
    expect(() => loadModelConfigs(configFile({ default: "b", models: [base] }), {})).toThrow(/Default/);
    expect(() => loadModelConfigs(configFile({ default: "a", models: [{ ...base, baseUrl: "not a url" }] }), {})).toThrow(/invalid baseUrl/);
  });

  it("the judges live in config: gpt-oss-20b judges every conversation; no second judge since 2026-10-01", () => {
    expect(getJudgeIds(undefined, {})).toEqual({ main: "groq/gpt-oss-20b" });
    expect(otherJudge("groq/gpt-oss-20b")).toBeUndefined();
    expect(otherJudge("gemini/gemma-4-31b")).toBe("groq/gpt-oss-20b"); // a report judged by another model still compares with the main judge
    const base = { id: "a", provider: "ollama", model: "x", baseUrl: "http://h/v1" };
    const b = { ...base, id: "b" };
    const withSecond = configFile({ default: "a", judges: { main: "a", second: "b" }, models: [base, b] });
    expect(getJudgeIds(withSecond, {})).toEqual({ main: "a", second: "b" });
    expect(otherJudge("a", withSecond)).toBe("b");
    expect(() => loadModelConfigs(configFile({ default: "a", judges: { main: "a", second: "nope" }, models: [base] }), {})).toThrow(/Judge model "nope"/);
  });

  it("unknown model ids fail with the list of known ones", () => {
    expect(() => getModelConfig("nope", undefined, {})).toThrow(/Known: .*ollama\/qwen3.5-4b/);
  });
});
