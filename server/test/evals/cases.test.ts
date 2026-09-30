import { describe, expect, it } from "vitest";
import { CASE_TYPES } from "../../src/evals/case-schema.ts";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { validateCases } from "../../src/evals/validate-cases.ts";

describe("the eval cases", () => {
  it("all match the seed data and the rules", () => {
    expect(validateCases(ALL_CASES)).toEqual([]);
  });

  it("have unique ids across files", () => {
    const ids = ALL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cover every case type in the dev split, ~40 cases in all", () => {
    const dev = ALL_CASES.filter((c) => c.split === "dev");
    for (const type of CASE_TYPES) expect(dev.some((c) => c.type === type), type).toBe(true);
    expect(dev.length).toBeGreaterThanOrEqual(35);
    expect(dev.length).toBeLessThanOrEqual(45);
  });
});
