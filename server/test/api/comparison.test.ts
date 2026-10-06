import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readComparisonSet } from "../../src/evals/runner/comparison-sets.ts";
import { inTx } from "../helpers.ts";
import { json, testApp } from "./helpers.ts";

const FILE = { router: { model: "gemini/gemini-3.5-flash-lite" }, shopping: { model: "gemini/gemini-3.5-flash-lite" }, support: { model: "gemini/gemini-3.5-flash-lite" } };

describe("GET /api/comparison", () => {
  it("lists the configured sets with their split; the first is the default", () =>
    inTx(async (tx) => {
      const { data } = await json(await testApp(tx).app.request("/api/comparison"));
      expect(data.default).toBe("test-1");
      expect(data.sets[0]).toEqual({ id: "test-1", label: expect.stringContaining("Test set"), split: "test", runs: ["test-1"], generated: true });
      expect(data.sets[1]).toEqual({ id: "test-2", label: expect.stringContaining("round 3"), split: "test", runs: ["test-2"], generated: true });
      expect(data.sets[2]).toEqual({ id: "dev-round-2", label: expect.stringContaining("round-2"), split: "dev", runs: ["dev-3-r2a", "dev-3-r2b"], generated: true });
    }));

  it("serves a set's committed file as is", () =>
    inTx(async (tx) => {
      const { data } = await json(await testApp(tx).app.request("/api/comparison/dev-round-2"));
      expect(data).toEqual(readComparisonSet("dev-round-2"));
      expect(data.models.map((m: any) => m.model)).toEqual(["gemini/gemini-3.5-flash-lite", "groq/gpt-oss-120b", "groq/qwen3.8-27b"]);
    }));

  it("unknown set 404; a configured set without its file says how to make it", () =>
    inTx(async (tx) => {
      const app = testApp(tx, { over: { comparison: { dir: mkdtempSync(join(tmpdir(), "sets-")) } } }).app;
      expect((await app.request("/api/comparison/nope")).status).toBe(404);
      const res = await app.request("/api/comparison/dev-round-2");
      expect([res.status, (await json(res)).error.code]).toEqual([404, "NOT_GENERATED"]);
      expect((await json(await app.request("/api/comparison"))).data.sets[0].generated).toBe(false);
    }));
});

describe("the Agents page's eval block", () => {
  it("comes from the default set: per model, each role's result", () =>
    inTx(async (tx) => {
      const app = testApp(tx, { over: { agents: { teamFile: () => FILE } } }).app;
      const { data } = await json(await app.request("/api/agents"));
      const set = readComparisonSet("test-1")!;
      expect(data.eval.set).toEqual({ id: "test-1", label: set.label, split: "test" });
      const lite = set.models[0]!.report;
      expect(data.eval.models[0]).toEqual({
        model: "gemini/gemini-3.5-flash-lite",
        taskSuccess: lite.taskSuccess,
        policyViolations: lite.policyViolations,
        byRole: { router: lite.routing, shopping: lite.byAgent.shopping, support: lite.byAgent.support },
      });
    }));

  it("is null before the sets are generated", () =>
    inTx(async (tx) => {
      const app = testApp(tx, { over: { agents: { teamFile: () => FILE }, comparison: { dir: mkdtempSync(join(tmpdir(), "sets-")) } } }).app;
      expect((await json(await app.request("/api/agents"))).data.eval).toBeNull();
    }));
});
