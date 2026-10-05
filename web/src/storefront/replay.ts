import type { AnsweredBy, Replay } from "../lib/api.ts";

/**
 * The static storefront's playback of a saved conversation: what appears, in
 * order, and how long after the previous thing. Pure, so it's tested in Node;
 * the widget only schedules it.
 */
export type ReplayEvent =
  | { kind: "customer"; text: string; afterMs: number }
  | { kind: "progress"; text: string; afterMs: number }
  | { kind: "agent"; text: string; answeredBy: AnsweredBy; afterMs: number };

export const REPLAY_PACE = { customer: 700, progress: 900, agent: 900 } as const;

export function replayTimeline(replay: Pick<Replay, "turns">): ReplayEvent[] {
  return replay.turns.flatMap((t, i): ReplayEvent[] => [
    { kind: "customer", text: t.customer, afterMs: i === 0 ? 300 : REPLAY_PACE.customer + 600 },
    ...t.progress.map((p): ReplayEvent => ({ kind: "progress", text: p, afterMs: REPLAY_PACE.progress })),
    { kind: "agent", text: t.reply, answeredBy: t.answeredBy, afterMs: REPLAY_PACE.agent },
  ]);
}

/** What the conversation shows after the first `shown` events: messages so far, and the progress line if one is current. */
export function replayView(events: ReplayEvent[], shown: number) {
  const done = events.slice(0, shown);
  const messages = done.filter((e): e is Exclude<ReplayEvent, { kind: "progress" }> => e.kind !== "progress");
  const last = done.at(-1);
  return { messages, progress: last?.kind === "progress" ? last.text : null, finished: shown >= events.length };
}

/** "the visitor isn't signed in" vs "signed in as Leila Lindqvist", for the recording's label. */
export const replayWho = (r: Pick<Replay, "customerName">) => (r.customerName ? `Signed in as ${r.customerName} (fictional)` : "A visitor who isn't signed in");
