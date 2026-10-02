import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Tx } from "../../src/db/client.ts";
import * as s from "../../src/db/schema.ts";
import type { RunReportJson } from "../../src/evals/runner/finish.ts";
import { DEFAULT_RESULTS_DIR } from "../../src/evals/runner/store.ts";
import { inTx } from "../helpers.ts";
import { TOKEN, json, testApp } from "./helpers.ts";

const appFor = (tx: Tx, over = {}) => testApp(tx, { over }).app;
const ADMIN = { headers: { authorization: `Bearer ${TOKEN}` } };
const get = async (app: ReturnType<typeof appFor>, path: string) => json(await app.request(path, path.startsWith("/api/admin/") ? ADMIN : {}));

async function fixtureRun(tx: Tx, id: string, startedAt: string, opts: { outcome?: (typeof s.RUN_OUTCOMES)[number]; model?: string; text?: string } = {}) {
  const model = opts.model ?? "gemini/gemini-3.5-flash-lite";
  await tx.insert(s.runs).values({ id, source: "fixture", team: { router: { model }, support: { model } }, labels: { persona: "maya" }, startedAt: new Date(startedAt), outcome: opts.outcome ?? "resolved", turns: 1 });
  await tx.insert(s.runSteps).values([
    { runId: id, seq: 2, turn: 1, kind: "reply", agent: "support", data: { message: "It shipped." }, createdAt: new Date(startedAt) },
    { runId: id, seq: 1, turn: 1, kind: "user_message", data: { text: opts.text ?? "Where is #1042?" }, createdAt: new Date(startedAt) },
  ]);
}

describe("GET /api/admin/runs (live, from the database)", () => {
  it("is admin-only: no token, no live traces; the old public path is gone", () =>
    inTx(async (tx) => {
      await fixtureRun(tx, "fx-a", "2026-10-01T10:00:00Z");
      const app = appFor(tx);
      expect((await app.request("/api/admin/runs")).status).toBe(401);
      expect((await app.request("/api/admin/runs/fx-a")).status).toBe(401);
      expect((await app.request("/api/runs")).status).toBe(404);
      expect((await app.request("/api/runs/fx-a")).status).toBe(404);
      expect((await appFor(tx, { adminToken: undefined }).request("/api/admin/runs/fx-a")).status).toBe(403);
    }));

  it("newest first, with the first customer message; filters by source, outcome and model", () =>
    inTx(async (tx) => {
      await fixtureRun(tx, "fx-a", "2026-10-01T10:00:00Z");
      await fixtureRun(tx, "fx-b", "2026-10-01T11:00:00Z", { outcome: "failed", model: "groq/gpt-oss-120b", text: "x".repeat(200) });
      const app = appFor(tx);
      const { data } = await get(app, "/api/admin/runs?source=fixture");
      expect(data.runs.map((r: any) => r.id)).toEqual(["fx-b", "fx-a"]);
      expect(data.runs[1]).toMatchObject({ source: "fixture", outcome: "resolved", firstMessage: "Where is #1042?", labels: { persona: "maya" } });
      expect(data.runs[0].firstMessage).toHaveLength(141); // 140 characters and an ellipsis
      expect((await get(app, "/api/admin/runs?source=fixture&outcome=failed")).data.runs.map((r: any) => r.id)).toEqual(["fx-b"]);
      expect((await get(app, "/api/admin/runs?source=fixture&model=gemini/gemini-3.5-flash-lite")).data.runs.map((r: any) => r.id)).toEqual(["fx-a"]);
      // A list of sources; an eval-runner trace isn't in it.
      await tx.insert(s.runs).values({ id: "fx-eval", source: "fixtureeval", team: {}, startedAt: new Date("2026-10-01T12:00:00Z") });
      expect((await get(app, "/api/admin/runs?source=fixture,fixtureeval")).data.runs.map((r: any) => r.id)).toEqual(["fx-eval", "fx-b", "fx-a"]);
      expect((await app.request("/api/admin/runs?source=demo;drop", ADMIN)).status).toBe(400);
    }));

  it("pages with a cursor, without skipping runs that started in the same millisecond", () =>
    inTx(async (tx) => {
      for (const id of ["fx-1", "fx-2", "fx-3", "fx-4", "fx-5"]) await fixtureRun(tx, id, "2026-10-01T10:00:00Z");
      const app = appFor(tx);
      const seen: string[] = [];
      let next: string | null = null;
      do {
        const { data }: any = await get(app, `/api/admin/runs?source=fixture&limit=2${next ? `&before=${next}` : ""}`);
        seen.push(...data.runs.map((r: any) => r.id));
        next = data.next;
      } while (next);
      expect(seen).toEqual(["fx-5", "fx-4", "fx-3", "fx-2", "fx-1"]);
      expect((await app.request("/api/admin/runs?before=garbage", ADMIN)).status).toBe(400);
      expect((await app.request("/api/admin/runs?limit=500", ADMIN)).status).toBe(400);
    }));

  it("one run with its steps in order; unknown run 404", () =>
    inTx(async (tx) => {
      await fixtureRun(tx, "fx-a", "2026-10-01T10:00:00Z");
      const app = appFor(tx);
      const { data } = await get(app, "/api/admin/runs/fx-a");
      expect(data.run.id).toBe("fx-a");
      expect(data.steps.map((st: any) => [st.seq, st.kind])).toEqual([[1, "user_message"], [2, "reply"]]);
      expect(data.steps[0]).toMatchObject({ data: { text: "Where is #1042?" }, at: "2026-10-01T10:00:00.000Z" });
      expect((await app.request("/api/admin/runs/nope", ADMIN)).status).toBe(404);
    }));
});

describe("GET /api/eval-runs (saved eval runs, from their files)", () => {
  const report = (run: string) => JSON.parse(readFileSync(join(DEFAULT_RESULTS_DIR, run, "report.json"), "utf8")) as RunReportJson;

  it("lists the saved runs with split, prompts and models", () =>
    inTx(async (tx) => {
      const { data } = await get(appFor(tx), "/api/eval-runs");
      expect(data.runs.find((r: any) => r.name === "dev-3-r2a")).toMatchObject({ split: "dev", promptSet: "round-2", cases: 40, models: expect.arrayContaining(["groq/gpt-oss-120b"]) });
    }));

  it("a run's conversations have the same final statuses its report counts", () =>
    inTx(async (tx) => {
      const app = appFor(tx);
      for (const m of report("dev-3-r2a").models) {
        const { data } = await get(app, `/api/eval-runs/dev-3-r2a/conversations?model=${encodeURIComponent(m.model)}`);
        const counts = Object.fromEntries(Object.keys(m.statuses).map((k) => [k, data.conversations.filter((c: any) => c.status === k).length]));
        expect(counts, m.model).toEqual(m.statuses);
      }
      const fails = (await get(app, "/api/eval-runs/dev-3-r2a/conversations?status=fail")).data.conversations;
      expect(fails.length).toBeGreaterThan(0);
      expect(fails.every((c: any) => c.status === "fail" && (c.failedChecks.length > 0 || c.judgeNo.length > 0))).toBe(true);
    }));

  it("one conversation: the case, the steps, each check with its severity, and the judge's answers with reasons", () =>
    inTx(async (tx) => {
      const { data } = await get(appFor(tx), `/api/eval-runs/dev-3-r2a/conversation?model=${encodeURIComponent("groq/gpt-oss-120b")}&case=refund-over-limit-01`);
      expect(data.case.id).toBe("refund-over-limit-01");
      expect(data.steps[0].kind).toBe("user_message");
      expect(data.grade.checks.every((k: any) => ["policy", "grounding", "task"].includes(k.severity))).toBe(true);
      expect(data.verdict.ok).toBe(true);
      expect(data.verdict.output.checks[0]).toMatchObject({ id: expect.any(String), answer: expect.any(Boolean), why: expect.any(String) });
      expect(data.judge.model).toBe("groq/gpt-oss-20b");
    }));

  it("names that aren't saved runs are 404, including paths that try to leave the folder", () =>
    inTx(async (tx) => {
      const app = appFor(tx);
      expect((await app.request("/api/eval-runs/nope/conversations")).status).toBe(404);
      expect((await app.request("/api/eval-runs/..%2F..%2Fconfig/conversations")).status).toBe(404);
      expect((await app.request("/api/eval-runs/dev-3-r2a/conversation?model=x&case=y")).status).toBe(404);
      expect((await app.request("/api/eval-runs/dev-3-r2a/conversation?model=x")).status).toBe(400);
      expect((await app.request("/api/eval-runs/dev-3-r2a/conversations?status=maybe")).status).toBe(400);
      const empty = appFor(tx, { runs: { resultsDir: mkdtempSync(join(tmpdir(), "runs-")) } });
      expect((await get(empty, "/api/eval-runs")).data.runs).toEqual([]);
    }));
});
