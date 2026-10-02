import { describe, expect, it } from "vitest";
import { ciBar, ciText, gapText, meanText, rateText, winnerText } from "./comparison.ts";

const r = (k: number, n: number, ci: [number, number]) => ({ k, n, rate: n ? k / n : 0, ci });

describe("comparison display", () => {
  it("formats rates, intervals and means", () => {
    expect(rateText(r(67, 79, [0.75, 0.91]))).toBe("85% (67/79)");
    expect(rateText(r(0, 0, [0, 0]))).toBe("–");
    expect(ciText(r(67, 79, [0.7512, 0.9134]))).toBe("75–91%");
    expect(meanText({ mean: 4.625, ci: [4.5, 4.75], n: 80 })).toBe("4.63 (4.50–4.75)");
    expect(meanText(null)).toBe("–");
    expect([gapText(null), gapText(0.1215)]).toEqual(["single run", "12 pts"]);
  });

  it("places the interval bar on a 0–100 track", () => {
    expect(ciBar(r(67, 79, [0.75, 0.91]))).toEqual({ left: 75, width: 16, point: (67 / 79) * 100 });
    expect(ciBar(r(0, 0, [0, 0]))).toBeNull();
    expect(ciBar(r(10, 10, [0.72, 1.0000001]))!.width).toBeCloseTo(28);
  });

  it("says what the winner rule decided, including when it can't separate models", () => {
    expect(winnerText({ kind: "not_significant", model: "a", runnerUp: "b" })).toBe("a leads, not significant: its 95% interval overlaps b's, so this data can't separate them.");
    expect(winnerText({ kind: "significant", model: "a", runnerUp: "b" })).toMatch(/^a has the highest task success among models with zero policy violations/);
    expect(winnerText({ kind: "none", reason: "Every model had at least one policy violation." })).toBe("No winner: Every model had at least one policy violation.");
    expect(winnerText({ kind: "not_significant", model: "a", runnerUp: null })).toMatch(/only model/);
  });
});
