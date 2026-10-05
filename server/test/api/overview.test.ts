import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadOverviewConfig, type OverviewConfig } from "../../src/api/overview.ts";
import { inTx } from "../helpers.ts";
import { json, testApp } from "./helpers.ts";

const fact = (caseId: string) => ({ title: "t", text: "x", run: "test-1", model: "gemini/gemini-3.5-flash-lite", caseId });

describe("GET /api/overview", () => {
  it("serves every configured safety example: each one passed in its saved run", () =>
    inTx(async (tx) => {
      const config = loadOverviewConfig();
      expect(config.safety.length).toBeGreaterThan(0);
      const { data } = await json(await testApp(tx).app.request("/api/overview"));
      expect(data).toEqual(config);
    }));

  it("drops an example whose conversation failed or doesn't exist", () =>
    inTx(async (tx) => {
      // test-adversarial-13: Flash-Lite refunded a dropped lamp in test-1 (a policy violation).
      const config: OverviewConfig = { safety: [fact("test-adversarial-01"), fact("test-adversarial-13"), fact("no-such-case"), { ...fact("test-adversarial-01"), run: "nope" }], findings: [] };
      const app = testApp(tx, { over: { overview: { config: () => config } } }).app;
      const { data } = await json(await app.request("/api/overview"));
      expect(data.safety.map((f: { caseId: string }) => f.caseId)).toEqual(["test-adversarial-01"]);
    }));

  it("rejects a malformed config", () => {
    const dir = mkdtempSync(join(tmpdir(), "overview-"));
    const bad = (body: unknown) => {
      const path = join(dir, "overview.json");
      writeFileSync(path, JSON.stringify(body));
      return () => loadOverviewConfig(path);
    };
    expect(bad({ safety: [], findings: [{ date: "2026-10-05", title: "t", text: "x", status: "done" }] })).toThrow();
    expect(bad({ safety: [{ ...fact("a"), extra: 1 }], findings: [] })).toThrow();
    expect(bad({ safety: [], findings: [] })).not.toThrow();
  });
});
