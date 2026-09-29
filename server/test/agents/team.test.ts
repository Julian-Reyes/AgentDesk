import { describe, expect, it } from "vitest";
import { buildTeam, loadTeamSpec } from "../../src/agents/team.ts";

describe("team config", () => {
  it("config/team.json names a model for every role; MODEL overrides all of them", () => {
    const spec = loadTeamSpec({});
    for (const role of ["router", "shopping", "support"] as const) expect(spec[role].model).toMatch(/^[a-z]+\//);
    expect(loadTeamSpec({ MODEL: "groq/gpt-oss-120b" })).toEqual({
      router: { model: "groq/gpt-oss-120b" },
      shopping: { model: "groq/gpt-oss-120b" },
      support: { model: "groq/gpt-oss-120b" },
    });
  });

  it("records model, provider and prompt version per role", () => {
    const team = buildTeam(loadTeamSpec({ MODEL: "ollama/qwen3.5-4b" }), { env: {}, cacheMode: "off" });
    expect(team.meta.support).toEqual({ model: "ollama/qwen3.5-4b", provider: "ollama", prompt: expect.stringMatching(/^support@2#[0-9a-f]{8}$/) });
    expect(Object.keys(team.agents).sort()).toEqual(["shopping", "support"]);
  });

  it("a cloud model without its API key fails at startup with the variable name", () => {
    expect(() => buildTeam(loadTeamSpec({ MODEL: "groq/gpt-oss-120b" }), { env: {} })).toThrow(/GROQ_API_KEY/);
  });

  it("the fake model can't be used without a scripted provider", () => {
    expect(() => buildTeam(loadTeamSpec({ MODEL: "fake" }), { env: {} })).toThrow(/FakeProvider/);
  });
});
