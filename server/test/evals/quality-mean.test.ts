import { describe, expect, it } from "vitest";
import { mean } from "../../src/evals/runner/report.ts";

describe("quality means: the 95% interval stays on the 1–5 scale", () => {
  it("clips an interval that would pass 5 (many 5s, a few 4s)", () => {
    const m = mean([5, 5, 5, 5, 5, 5, 5, 5, 4, 3])!;
    expect(m.mean).toBeCloseTo(4.7);
    expect(m.ci[1]).toBe(5);
    expect(m.ci[0]).toBeGreaterThan(4);
  });
  it("clips at 1 too, and leaves an interval inside the scale alone", () => {
    expect(mean([1, 1, 1, 1, 2, 3])!.ci[0]).toBe(1);
    const mid = mean([3, 3, 4, 4, 3, 4])!;
    expect(mid.ci[0]).toBeGreaterThan(1);
    expect(mid.ci[1]).toBeLessThan(5);
  });
  it("no scores, no mean", () => {
    expect(mean([])).toBeNull();
  });
});
