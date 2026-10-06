import { describe, expect, it } from "vitest";
import type { AppDeps } from "../../src/api/app.ts";
import type { Tx } from "../../src/db/client.ts";
import * as s from "../../src/db/schema.ts";
import { teamFromDb } from "../../src/agents/team-store.ts";
import { buildTeam, loadTeamSpec } from "../../src/agents/team.ts";
import { FakeProvider } from "../../src/llm/fake.ts";
import { inTx } from "../helpers.ts";
import { TOKEN, json, testApp } from "./helpers.ts";

const LITE = "gemini/gemini-3.5-flash-lite";
const OSS = "groq/gpt-oss-120b";
const FILE = { router: { model: LITE }, shopping: { model: LITE }, support: { model: LITE } };
const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const post = (body: unknown, headers: Record<string, string> = auth) => ({ method: "POST", headers, body: JSON.stringify(body) });
const REASON = "Fewer failed tool calls on dev-3";

const appFor = (tx: Tx, over: Partial<AppDeps> = {}) => testApp(tx, { over: { agents: { teamFile: () => FILE }, ...over } }).app;

describe("GET /api/agents", () => {
  it("per role: current model, prompt version, history; the models a role can use, with paid ones marked", () =>
    inTx(async (tx) => {
      await tx.delete(s.teamChanges);
      const { data } = await json(await appFor(tx).request("/api/agents"));
      expect(data.roles.map((r: any) => [r.role, r.model, r.provider])).toEqual([
        ["router", LITE, "gemini"],
        ["shopping", LITE, "gemini"],
        ["support", LITE, "gemini"],
      ]);
      expect(data.roles[0].prompt).toMatch(/^router@\d+#[0-9a-f]{8}$/);
      expect(data.roles[2].prompt).toMatch(/^support@\d+#/);
      expect(data.roles[2].history).toEqual([expect.objectContaining({ action: "initial", toModel: LITE, decidedBy: "system" })]);
      expect(data.roles[2].since).toBeNull(); // the initial row only marks when the history began
      expect(data.envOverride).toBeNull();
      expect(data.liveWindowDays).toBe(7);
      const byId = new Map(data.models.map((m: any) => [m.id, m]));
      expect(byId.get(LITE)).toMatchObject({ paid: true }); // paid tier since 2026-10-06
      expect(byId.get(OSS)).toMatchObject({ paid: true });
      expect(byId.has("fake")).toBe(false);
    }));

  it("shows when MODEL in .env overrides the team", () =>
    inTx(async (tx) => {
      const { data } = await json(await appFor(tx, { agents: { teamFile: () => FILE, envModel: "fake" } }).request("/api/agents"));
      expect(data.envOverride).toBe("fake");
    }));
});

describe("POST /api/admin/agents/:role/:action", () => {
  it("needs the admin token; nothing changes without it", () =>
    inTx(async (tx) => {
      await tx.delete(s.teamChanges);
      const app = appFor(tx);
      for (const action of ["switch", "retire", "reinstate"]) {
        const res = await app.request(`/api/admin/agents/support/${action}`, post({ model: OSS, reason: REASON }, { "content-type": "application/json" }));
        expect(res.status).toBe(401);
      }
      const { data } = await json(await app.request("/api/agents"));
      expect(data.roles[2].history).toHaveLength(1);
    }));

  it("switch with a reason, then it's in the history and current", () =>
    inTx(async (tx) => {
      await tx.delete(s.teamChanges);
      const app = appFor(tx);
      const res = await app.request("/api/admin/agents/support/switch", post({ model: OSS, reason: REASON }));
      expect(res.status).toBe(200);
      expect((await json(res)).data).toMatchObject({ role: "support", action: "switch", fromModel: LITE, toModel: OSS, decidedBy: "admin", at: "2026-10-02T12:00:00.000Z" });
      const { data } = await json(await app.request("/api/agents"));
      expect(data.roles[2]).toMatchObject({ model: OSS, provider: "groq", since: "2026-10-02T12:00:00.000Z" });
      expect(data.roles[2].history[0]).toMatchObject({ action: "switch", reason: REASON });
    }));

  it("refusals: no reason, retiring the current model with no replacement, unknown role, bad body", () =>
    inTx(async (tx) => {
      await tx.delete(s.teamChanges);
      const app = appFor(tx);
      const noReason = await app.request("/api/admin/agents/support/switch", post({ model: OSS, reason: "" }));
      expect([noReason.status, (await json(noReason)).error.code]).toEqual([400, "REASON_REQUIRED"]);
      const noRepl = await app.request("/api/admin/agents/support/retire", post({ model: LITE, reason: REASON }));
      expect((await json(noRepl)).error.code).toBe("REPLACEMENT_REQUIRED");
      expect((await app.request("/api/admin/agents/cashier/switch", post({ model: OSS, reason: REASON }))).status).toBe(404);
      expect((await app.request("/api/admin/agents/support/promote", post({ model: OSS, reason: REASON }))).status).toBe(404);
      expect((await app.request("/api/admin/agents/support/switch", post({ reason: REASON }))).status).toBe(400);
      expect((await app.request("/api/admin/agents/support/switch", post({ model: "fake", reason: REASON }))).status).toBe(400);
    }));

  it("refuses a switch to a model the server can't run, and saves nothing", () =>
    inTx(async (tx) => {
      await tx.delete(s.teamChanges);
      const app = appFor(tx, { agents: { teamFile: () => FILE, canBuild: () => "GROQ_API_KEY is not set" } });
      const res = await app.request("/api/admin/agents/support/switch", post({ model: OSS, reason: REASON }));
      expect((await json(res)).error).toEqual({ code: "MODEL_UNAVAILABLE", message: "GROQ_API_KEY is not set" });
      expect((await json(await app.request("/api/agents"))).data.roles[2].model).toBe(LITE);
    }));
});

describe("the chat uses the current team", () => {
  it("a switch applies to the next conversation, without a restart", () =>
    inTx(async (tx) => {
      await tx.delete(s.teamChanges);
      // The real per-chat builder (as in serve.ts), with a build step that records the spec and returns scripted models.
      const built: string[] = [];
      const team = teamFromDb(tx, {
        fileSpec: () => FILE,
        now: () => new Date("2026-10-02T12:00:00Z"),
        env: {},
        build: (spec) => {
          built.push(spec.support.model);
          return buildTeam(loadTeamSpec({ MODEL: "fake" }), { fakes: { router: new FakeProvider([]), shopping: new FakeProvider([]), support: new FakeProvider([]) }, env: {} });
        },
      });
      const app = appFor(tx, { team });
      const start = () => app.request("/api/chat", post({ persona: "anonymous" }, { "content-type": "application/json" }));
      expect((await start()).status).toBe(201);
      await app.request("/api/admin/agents/support/switch", post({ model: OSS, reason: REASON }));
      expect((await start()).status).toBe(201);
      expect(built).toEqual([LITE, OSS]);
      // MODEL in the environment still wins.
      const overridden = teamFromDb(tx, { fileSpec: () => FILE, now: () => new Date(), env: { MODEL: "fake" }, build: (spec) => (built.push(spec.support.model), buildTeam(spec, { fakes: { router: new FakeProvider([]), shopping: new FakeProvider([]), support: new FakeProvider([]) }, env: {} })) });
      await overridden();
      expect(built.at(-1)).toBe("fake");
    }));
});
