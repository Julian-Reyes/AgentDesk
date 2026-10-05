import { describe, expect, it } from "vitest";
import { replayTimeline, replayView, replayWho } from "./replay.ts";

const replay = {
  turns: [
    { customer: "Where's my order?", progress: ["Looking up your order…", "Checking tracking…"], reply: "It shipped.", answeredBy: "support" as const },
    { customer: "Thanks!", progress: [], reply: "You're welcome.", answeredBy: "support" as const },
  ],
};

describe("chat recordings", () => {
  it("play each turn as the live widget would: message, progress labels, reply", () => {
    expect(replayTimeline(replay).map((e) => `${e.kind}:${e.text}`)).toEqual([
      "customer:Where's my order?",
      "progress:Looking up your order…",
      "progress:Checking tracking…",
      "agent:It shipped.",
      "customer:Thanks!",
      "agent:You're welcome.",
    ]);
    expect(replayTimeline(replay).every((e) => e.afterMs > 0)).toBe(true);
  });

  it("show the messages so far, the current progress line, and when it's finished", () => {
    const events = replayTimeline(replay);
    expect(replayView(events, 0)).toEqual({ messages: [], progress: null, finished: false });
    expect(replayView(events, 2)).toMatchObject({ messages: [{ kind: "customer" }], progress: "Looking up your order…" });
    expect(replayView(events, 4)).toMatchObject({ progress: null, finished: false });
    expect(replayView(events, events.length)).toMatchObject({ finished: true });
    expect(replayView(events, events.length).messages).toHaveLength(4);
  });

  it("say who the customer is, by name only", () => {
    expect(replayWho({ customerName: "Leila Lindqvist" })).toBe("Signed in as Leila Lindqvist (fictional)");
    expect(replayWho({ customerName: null })).toBe("A visitor who isn't signed in");
  });
});
