import { describe, expect, it } from "vitest";
import { liveMetrics } from "../../src/agents/live-metrics.ts";
import { changeTeam, foldHistory, loadDbTeamSpec, planChange, readTeam, type TeamChangeRequest, type TeamState } from "../../src/agents/team-store.ts";
import type { TeamSpec } from "../../src/agents/team.ts";
import type { Tx } from "../../src/db/client.ts";
import * as s from "../../src/db/schema.ts";
import { loadModelConfigs } from "../../src/llm/config.ts";
import { inTx } from "../helpers.ts";

const LITE = "gemini/gemini-3.5-flash-lite";
const OSS = "groq/gpt-oss-120b";
const QWEN = "groq/qwen3.8-27b";
const KNOWN = [LITE, OSS, QWEN];
const FILE: TeamSpec = { router: { model: LITE }, shopping: { model: LITE }, support: { model: LITE } };
const AT = new Date("2026-10-02T12:00:00Z");
const REASON = "Better tool-call health in dev-3";

const state = (support = LITE, retired: string[] = []): TeamState => ({
  current: { router: LITE, shopping: LITE, support },
  retired: { router: [], shopping: [], support: retired },
});

describe("team rules (pure)", () => {
  it("a switch needs a real reason and a known model that isn't current", () => {
    const sw = (over: Partial<TeamChangeRequest>) => planChange(state(), { action: "switch", role: "support", model: OSS, reason: REASON, ...over } as TeamChangeRequest, KNOWN);
    expect(sw({})).toEqual({ ok: true, data: { model: OSS, fromModel: LITE, toModel: OSS } });
    expect(sw({ reason: "" })).toMatchObject({ ok: false, error: { code: "REASON_REQUIRED" } });
    expect(sw({ reason: "   because  " })).toMatchObject({ ok: false, error: { code: "REASON_REQUIRED" } });
    expect(sw({ reason: "x".repeat(501) })).toMatchObject({ ok: false, error: { code: "REASON_TOO_LONG" } });
    expect(sw({ model: "openai/gpt-9" })).toMatchObject({ ok: false, error: { code: "UNKNOWN_MODEL" } });
    expect(sw({ model: LITE })).toMatchObject({ ok: false, error: { code: "ALREADY_CURRENT" } });
  });

  it("retiring the current model needs a replacement, so the role always has a model", () => {
    const retire = (replacement?: string) => planChange(state(), { action: "retire", role: "support", model: LITE, replacement, reason: REASON }, KNOWN);
    expect(retire()).toMatchObject({ ok: false, error: { code: "REPLACEMENT_REQUIRED" } });
    expect(retire(LITE)).toMatchObject({ ok: false, error: { code: "REPLACEMENT_REQUIRED" } });
    expect(retire("nope")).toMatchObject({ ok: false, error: { code: "UNKNOWN_MODEL" } });
    expect(retire(OSS)).toEqual({ ok: true, data: { model: LITE, fromModel: LITE, toModel: OSS } });
  });

  it("retiring another model leaves the current one, and takes no replacement", () => {
    expect(planChange(state(), { action: "retire", role: "support", model: QWEN, reason: REASON }, KNOWN)).toEqual({ ok: true, data: { model: QWEN, fromModel: LITE, toModel: LITE } });
    expect(planChange(state(), { action: "retire", role: "support", model: QWEN, replacement: OSS, reason: REASON }, KNOWN)).toMatchObject({ ok: false, error: { code: "REPLACEMENT_NOT_NEEDED" } });
  });

  it("a retired combination is blocked until reinstated, in that role only", () => {
    const s1 = state(LITE, [QWEN]);
    expect(planChange(s1, { action: "switch", role: "support", model: QWEN, reason: REASON }, KNOWN)).toMatchObject({ ok: false, error: { code: "RETIRED" } });
    expect(planChange(s1, { action: "retire", role: "support", model: LITE, replacement: QWEN, reason: REASON }, KNOWN)).toMatchObject({ ok: false, error: { code: "RETIRED" } });
    expect(planChange(s1, { action: "retire", role: "support", model: QWEN, reason: REASON }, KNOWN)).toMatchObject({ ok: false, error: { code: "ALREADY_RETIRED" } });
    expect(planChange(s1, { action: "switch", role: "shopping", model: QWEN, reason: REASON }, KNOWN)).toMatchObject({ ok: true });
    expect(planChange(s1, { action: "reinstate", role: "support", model: QWEN, reason: REASON }, KNOWN)).toEqual({ ok: true, data: { model: QWEN, fromModel: LITE, toModel: LITE } });
    expect(planChange(s1, { action: "reinstate", role: "support", model: OSS, reason: REASON }, KNOWN)).toMatchObject({ ok: false, error: { code: "NOT_RETIRED" } });
  });

  it("folds the history: current = latest to_model; retire/reinstate toggle the combination", () => {
    const row = (role: s.TeamRole, action: s.TeamAction, model: string, toModel: string) => ({ role, action, model, toModel });
    expect(foldHistory([row("router", "initial", LITE, LITE)])).toBeNull();
    const rows = [
      row("router", "initial", LITE, LITE),
      row("shopping", "initial", LITE, LITE),
      row("support", "initial", LITE, LITE),
      row("support", "retire", LITE, OSS),
      row("support", "reinstate", LITE, OSS),
      row("support", "retire", QWEN, OSS),
    ];
    expect(foldHistory(rows)).toEqual({ current: { router: LITE, shopping: LITE, support: OSS }, retired: { router: [], shopping: [], support: [QWEN] } });
  });
});

describe("team history (database)", () => {
  const ctx = { fileSpec: FILE, known: KNOWN, at: AT, decidedBy: "admin" };

  it("the first read records the starting team from the file, once", () =>
    inTx(async (tx) => {
      await tx.delete(s.teamChanges);
      const first = await readTeam(tx, FILE, AT);
      expect(first.history.map((h) => [h.role, h.action, h.toModel, h.decidedBy])).toEqual([
        ["router", "initial", LITE, "system"],
        ["shopping", "initial", LITE, "system"],
        ["support", "initial", LITE, "system"],
      ]);
      // Later file changes don't matter any more: the database decides.
      const again = await readTeam(tx, { ...FILE, support: { model: QWEN } }, AT);
      expect(again.history).toHaveLength(3);
      expect(again.state.current.support).toBe(LITE);
    }));

  it("switch, retire with replacement, blocked switch, reinstate: all appended, nothing rewritten", () =>
    inTx(async (tx) => {
      await tx.delete(s.teamChanges);
      expect(await changeTeam(tx, { action: "switch", role: "support", model: OSS, reason: REASON }, ctx)).toMatchObject({ ok: true, data: { action: "switch", fromModel: LITE, toModel: OSS, reason: REASON } });
      expect(await changeTeam(tx, { action: "retire", role: "support", model: OSS, replacement: QWEN, reason: "Too many HTTP 400s" }, ctx)).toMatchObject({ ok: true });
      expect(await changeTeam(tx, { action: "switch", role: "support", model: OSS, reason: REASON }, ctx)).toMatchObject({ ok: false, error: { code: "RETIRED" } });
      expect(await changeTeam(tx, { action: "switch", role: "support", model: LITE, reason: "  " }, ctx)).toMatchObject({ ok: false, error: { code: "REASON_REQUIRED" } });
      expect(await changeTeam(tx, { action: "reinstate", role: "support", model: OSS, reason: "Groq fixed the 400s" }, ctx)).toMatchObject({ ok: true });
      expect(await changeTeam(tx, { action: "switch", role: "support", model: OSS, reason: REASON }, ctx)).toMatchObject({ ok: true });

      const { state, history } = await readTeam(tx, FILE, AT);
      expect(history.map((h) => [h.role, h.action, h.model, h.fromModel, h.toModel]).slice(3)).toEqual([
        ["support", "switch", OSS, LITE, OSS],
        ["support", "retire", OSS, OSS, QWEN],
        ["support", "reinstate", OSS, QWEN, QWEN],
        ["support", "switch", OSS, QWEN, OSS],
      ]);
      expect(state).toEqual({ current: { router: LITE, shopping: LITE, support: OSS }, retired: { router: [], shopping: [], support: [] } });
      expect(await loadDbTeamSpec(tx, FILE, AT, {})).toEqual({ ...FILE, support: { model: OSS } });
    }));

  it("a team that can't be built (no API key) is refused before anything is saved", () =>
    inTx(async (tx) => {
      await tx.delete(s.teamChanges);
      const canBuild = (spec: TeamSpec) => (spec.support.model === OSS ? 'Model "groq/gpt-oss-120b" needs GROQ_API_KEY in .env' : null);
      const r = await changeTeam(tx, { action: "switch", role: "support", model: OSS, reason: REASON }, { ...ctx, canBuild });
      expect(r).toMatchObject({ ok: false, error: { code: "MODEL_UNAVAILABLE", message: expect.stringContaining("GROQ_API_KEY") } });
      expect((await readTeam(tx, FILE, AT)).history).toHaveLength(3);
      // Retiring a model that isn't current changes no model, so nothing to build.
      expect(await changeTeam(tx, { action: "retire", role: "support", model: OSS, reason: REASON }, { ...ctx, canBuild })).toMatchObject({ ok: true });
    }));

  it("MODEL in the environment still overrides every role", () =>
    inTx(async (tx) => {
      await changeTeam(tx, { action: "switch", role: "support", model: OSS, reason: REASON }, ctx);
      expect(await loadDbTeamSpec(tx, FILE, AT, { MODEL: "fake" })).toEqual({ router: { model: "fake" }, shopping: { model: "fake" }, support: { model: "fake" } });
    }));
});

describe("live metrics", () => {
  async function run(tx: Tx, id: string, source: string, startedAt: Date, outcome: (typeof s.RUN_OUTCOMES)[number] | null, steps: { kind: string; agent: string; model: string; latencyMs: number; cached?: boolean }[]) {
    await tx.insert(s.runs).values({ id, source, team: {}, startedAt, outcome, inputTokens: 0, outputTokens: 0 });
    await tx.insert(s.runSteps).values(
      steps.map((st, i) => ({ runId: id, seq: i + 1, turn: 1, kind: st.kind, agent: st.agent, modelConfigId: st.model, data: {}, inputTokens: 1_000_000, outputTokens: 100_000, latencyMs: st.latencyMs, cached: st.cached ?? false, createdAt: startedAt })),
    );
  }

  it("counts live conversations per role and model over the window, never evals", () =>
    inTx(async (tx) => {
      const day = (d: number) => new Date(Date.UTC(2026, 9, d, 12));
      const r = (model: string, ms: number) => ({ kind: "router", agent: "router", model, latencyMs: ms });
      const sup = (model: string, ms: number, cached = false) => ({ kind: "model_call", agent: "support", model, latencyMs: ms, cached });
      await run(tx, "t-live-1", "demo", day(1), "resolved", [r(LITE, 100), sup(OSS, 1000), sup(OSS, 3000)]);
      await run(tx, "t-live-2", "cli", day(2), "failed", [r(LITE, 300), sup(OSS, 2000, true)]);
      await run(tx, "t-live-3", "demo", day(2), null, [r(LITE, 200)]); // still open
      await run(tx, "t-eval", "eval", day(2), "resolved", [r(LITE, 9999), sup(OSS, 9999)]);
      await run(tx, "t-old", "demo", new Date("2026-09-20T00:00:00Z"), "resolved", [r(LITE, 9999)]);

      const m = await liveMetrics(tx, new Date("2026-09-25T00:00:00Z"), loadModelConfigs().models);
      const mine = m.filter((x) => ["router", "support"].includes(x.role));
      expect(mine.find((x) => x.role === "router")).toMatchObject({
        model: LITE,
        conversations: 3,
        calls: 3,
        outcomes: { resolved: 1, failed: 1, escalated: 0, approval_needed: 0 },
        failureRate: 0.5,
        latencyMs: { p50: 200, p95: 300 },
        costMicros: 0, // these calls (2026-10-01/02) were on Flash-Lite's free tier, before its paid tier began on 2026-10-06
      });
      // gpt-oss-120b: 3 calls, one from the cache, so 2M input + 200K output tokens are paid.
      const oss = loadModelConfigs().models.find((x) => x.id === OSS)!;
      expect(mine.find((x) => x.role === "support")).toMatchObject({
        model: OSS,
        conversations: 2,
        calls: 3,
        inputTokens: 3_000_000,
        latencyMs: { p50: 2000, p95: 3000 },
        costMicros: Math.round(2_000_000 * oss.pricing.inputPerMTok + 200_000 * oss.pricing.outputPerMTok),
      });
    }));

  it("prices Flash-Lite's calls from its paid tier on, never its free-tier history", () =>
    inTx(async (tx) => {
      await run(tx, "t-free", "demo", new Date("2026-10-05T12:00:00Z"), "resolved", [{ kind: "router", agent: "router", model: LITE, latencyMs: 100 }]);
      await run(tx, "t-paid", "demo", new Date("2026-10-07T12:00:00Z"), "resolved", [{ kind: "router", agent: "router", model: LITE, latencyMs: 100 }]);
      const lite = loadModelConfigs().models.find((x) => x.id === LITE)!;
      const m = await liveMetrics(tx, new Date("2026-10-01T00:00:00Z"), loadModelConfigs().models);
      // Both calls count, but only the paid one (1M in / 100K out) is priced.
      expect(m.find((x) => x.role === "router" && x.model === LITE)).toMatchObject({
        calls: 2,
        costMicros: Math.round(1_000_000 * lite.pricing.inputPerMTok + 100_000 * lite.pricing.outputPerMTok),
      });
    }));
});
