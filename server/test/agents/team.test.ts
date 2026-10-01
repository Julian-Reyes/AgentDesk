import { describe, expect, it } from "vitest";
import { AGENT_PROMPTS, PROMPT_SETS, SHOPPING_PROMPT, SHOPPING_PROMPT_V1, SUPPORT_PROMPT, promptId } from "../../src/agents/prompts.ts";
import { buildTeam, loadTeamSpec } from "../../src/agents/team.ts";
import { FakeProvider } from "../../src/llm/fake.ts";

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
    expect(team.meta.support).toEqual({ model: "ollama/qwen3.5-4b", provider: "ollama", prompt: expect.stringMatching(/^support@3#[0-9a-f]{8}$/) });
    expect(Object.keys(team.agents).sort()).toEqual(["shopping", "support"]);
  });

  it("a cloud model without its API key fails at startup with the variable name", () => {
    expect(() => buildTeam(loadTeamSpec({ MODEL: "groq/gpt-oss-120b" }), { env: {} })).toThrow(/GROQ_API_KEY/);
  });

  it("the fake model can't be used without a scripted provider", () => {
    expect(() => buildTeam(loadTeamSpec({ MODEL: "fake" }), { env: {} })).toThrow(/FakeProvider/);
  });
});

describe("prompt sets (tuning round 1, 2026-10-01)", () => {
  it("round-0 is exactly what dev-1 ran with: the hashes recorded in its files", () => {
    expect(promptId(PROMPT_SETS["round-0"].shopping)).toBe("shopping@1#a30c8613");
    expect(promptId(PROMPT_SETS["round-0"].support)).toBe("support@2#cca33593");
  });

  it("round-1 is the current set: round 0 plus the approved rules, nothing removed", () => {
    expect(PROMPT_SETS["round-1"]).toBe(AGENT_PROMPTS);
    for (const agent of ["shopping", "support"] as const) {
      const before = PROMPT_SETS["round-0"][agent].text.split("\n");
      const after = PROMPT_SETS["round-1"][agent].text.split("\n");
      const changed = before.filter((l) => !after.includes(l));
      // Only support's refund and escalation lines were reworded; everything else is kept.
      expect(changed.length, agent).toBe(agent === "support" ? 2 : 0);
    }
    expect(SHOPPING_PROMPT.text).toContain("Never suggest a code you haven't checked.");
    expect(SUPPORT_PROMPT.text).toContain("never say a replacement is on its way");
    expect(SUPPORT_PROMPT.text).toContain('Never say "I\'ll let you know"');
  });

  it("buildTeam uses the prompt set it's given, and records it", () => {
    const fakes = { router: new FakeProvider(), shopping: new FakeProvider(), support: new FakeProvider() };
    const team = buildTeam(loadTeamSpec({ MODEL: "fake" }), { env: {}, fakes, prompts: PROMPT_SETS["round-0"] });
    expect(team.meta.support!.prompt).toBe("support@2#cca33593");
    expect(team.agents.shopping.prompt).toBe(SHOPPING_PROMPT_V1);
    expect(buildTeam(loadTeamSpec({ MODEL: "fake" }), { env: {}, fakes }).meta.support!.prompt).toBe(promptId(SUPPORT_PROMPT));
  });
});
