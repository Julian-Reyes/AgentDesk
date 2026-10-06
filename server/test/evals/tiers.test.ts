import { describe, expect, it } from "vitest";
import { renderReport, tierNotes } from "../../src/evals/runner/report.ts";
import { mergeTiers } from "../../src/evals/runner/store.ts";

const FL = "gemini/gemini-3.5-flash-lite";
const GPT = "groq/gpt-oss-120b";
// As in models.json: Flash-Lite moved to the paid tier on 2026-10-06; gpt-oss has always been paid.
const configs: Record<string, { tier?: string; tierChanges?: { on: string; from: string; to: string }[] }> = {
  [FL]: { tier: "paid", tierChanges: [{ on: "2026-10-06", from: "free", to: "paid" }] },
  [GPT]: { tier: "paid" },
};
const configFor = (m: string) => configs[m];

describe("mergeTiers: the tier each model ran on, across a run's sessions", () => {
  it("records the current tier on a new run", () => {
    expect(mergeTiers(undefined, { [FL]: "paid", [GPT]: "paid" })).toEqual({ [FL]: "paid", [GPT]: "paid" });
  });
  it("says so when a resumed run changed tier, and keeps saying so", () => {
    const mixed = mergeTiers({ [FL]: "free" }, { [FL]: "paid" });
    expect(mixed).toEqual({ [FL]: "free → paid" });
    expect(mergeTiers(mixed, { [FL]: "paid" })).toEqual({ [FL]: "free → paid" });
  });
  it("a run from before tiers were recorded, resumed, reads 'not recorded → paid'", () => {
    expect(mergeTiers({ [FL]: "not recorded" }, { [FL]: "paid" })).toEqual({ [FL]: "not recorded → paid" });
  });
});

describe("tierNotes: reports flag latency that isn't comparable across tiers", () => {
  it("a paid-tier run (test-2): Flash-Lite's latency isn't comparable with its free-tier runs", () => {
    const { notes, tiers } = tierNotes([FL, GPT], { createdAt: "2026-10-07T09:00:00Z", tiers: { [FL]: "paid", [GPT]: "paid" } }, configFor);
    expect(notes).toEqual([`**${FL} ran on the paid tier.** Its latency isn't comparable with its free-tier runs (before 2026-10-06).`]);
    expect(tiers).toEqual({ [FL]: "paid", [GPT]: "paid" }); // gpt-oss never changed tier: no note
  });
  it("an older run with no tiers recorded (test-1): inferred free from its date, and flagged the other way", () => {
    const { notes, tiers } = tierNotes([FL, GPT], { createdAt: "2026-10-05T09:40:00Z" }, configFor);
    expect(notes).toEqual([`**${FL} ran on the free tier** (before 2026-10-06; not recorded in this run). Its latency isn't comparable with its paid-tier runs (from 2026-10-06).`]);
    expect(tiers).toEqual({ [FL]: "free (inferred: ran before 2026-10-06)" });
  });
  it("a run on the day of the change, with only the date known (dev-r3): unknown, not guessed", () => {
    const { notes, tiers } = tierNotes([FL], { createdAt: "2026-10-06T10:55:00Z" }, configFor);
    expect(tiers).toEqual({ [FL]: "unknown" });
    expect(notes[0]).toMatch(/tier not recorded.*on 2026-10-06 \(time not recorded\).*may have run on either/);
  });
  it("judged by when the model's conversations ran, not when the run started (dev-dmg: started 10-05, Flash-Lite finished 10-06)", () => {
    expect(tierNotes([FL], { createdAt: "2026-10-05T15:00:00Z" }, configFor, { [FL]: "2026-10-06T09:50:00Z" }).tiers).toEqual({ [FL]: "unknown" });
  });
  it("with an exact switch time, runs on that day are placed on either side", () => {
    const exact = (m: string) => (m === FL ? { tierChanges: [{ on: "2026-10-06T16:00:00Z", from: "free", to: "paid" }] } : undefined);
    expect(tierNotes([FL], { createdAt: "2026-10-05T15:00:00Z" }, exact, { [FL]: "2026-10-06T09:50:00Z" }).tiers).toEqual({ [FL]: "free (inferred: ran before 2026-10-06T16:00:00Z)" });
    expect(tierNotes([FL], { createdAt: "2026-10-06T17:00:00Z" }, exact).tiers).toEqual({ [FL]: "paid (inferred: ran from 2026-10-06T16:00:00Z)" });
  });
  it("a run that changed tier part-way", () => {
    expect(tierNotes([FL], { tiers: { [FL]: "free → paid" } }, configFor).notes[0]).toMatch(/tier changed during this run \(free → paid\).*mixes both tiers/);
  });
  it("the notes appear at the top of report.md", () => {
    const md = renderReport("Eval run: x", [], [], null, ["**note one**"]);
    expect(md.split("\n").slice(0, 6).join("\n")).toContain("**note one**");
  });
});
