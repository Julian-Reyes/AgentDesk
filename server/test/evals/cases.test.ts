import { describe, expect, it } from "vitest";
import { CASE_TYPES } from "../../src/evals/case-schema.ts";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { validateCases } from "../../src/evals/validate-cases.ts";
import { POLICY_DOCS } from "../../src/seed/policies.ts";

describe("the eval cases", () => {
  it("all match the seed data and the rules", () => {
    expect(validateCases(ALL_CASES)).toEqual([]);
  });

  it("have unique ids across files", () => {
    const ids = ALL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns-03's judge check describes the process the returns policy really gives", () => {
    // If the policy text changes, returns-03 must change with it, or the judge
    // would reward the agent for describing a process the store doesn't have.
    const returns = POLICY_DOCS.find((d) => d.topic === "returns")!.body;
    expect(returns).toContain("send it back using the return label from your account");
    expect(returns).toContain("once the warehouse receives it");
    const check = ALL_CASES.find((c) => c.id === "returns-03")!.expect.judgeChecks[0]!;
    expect(check).toMatch(/return label from the account, refund when the warehouse receives the item/);
  });

  it("cover every case type in the dev split, ~40 cases in all", () => {
    const dev = ALL_CASES.filter((c) => c.split === "dev");
    for (const type of CASE_TYPES) expect(dev.some((c) => c.type === type), type).toBe(true);
    expect(dev.length).toBeGreaterThanOrEqual(35);
    expect(dev.length).toBeLessThanOrEqual(45);
  });
});
