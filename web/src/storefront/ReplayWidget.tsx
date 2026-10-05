import { useEffect, useMemo, useRef, useState } from "react";
import { getReplays, type Replay } from "../lib/api.ts";
import { SITE_ROOT } from "../lib/static.ts";
import { href } from "../ops/route.ts";
import { ANSWERED_BY_LABEL } from "./chat-state.ts";
import { replayTimeline, replayView, replayWho } from "./replay.ts";

/**
 * The static storefront's chat (M5, Julian 2026-10-05): no live model, so it
 * plays recordings of saved eval conversations, clearly labelled, with no text
 * box. Nothing a visitor does is sent anywhere. Each recording links to its
 * full trace in the dashboard.
 */
export function ReplayWidget() {
  const [open, setOpen] = useState(false);
  const [replays, setReplays] = useState<Replay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Replay | null>(null);
  const [shown, setShown] = useState(0);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !replays) getReplays().then((r) => setReplays(r.replays), (e: Error) => setError(e.message));
  }, [open, replays]);

  const events = useMemo(() => (playing ? replayTimeline(playing) : []), [playing]);
  const view = replayView(events, shown);

  // Play: show the next event after its delay. With reduced motion, show the whole conversation at once.
  useEffect(() => {
    if (!playing || shown >= events.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(events.length);
    const id = setTimeout(() => setShown((n) => n + 1), events[shown]!.afterMs);
    return () => clearTimeout(id);
  }, [playing, shown, events]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [shown]);

  const play = (r: Replay) => {
    setPlaying(r);
    setShown(0);
  };
  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  if (!open) {
    return (
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-forest-700 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-forest-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 sm:bottom-6 sm:right-6"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
          <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h9A2.5 2.5 0 0 1 17 4.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5V14h0A2 2 0 0 1 3 12V4.5Z" />
        </svg>
        Watch recorded chats
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Recorded chats"
      onKeyDown={(e) => e.key === "Escape" && close()}
      className="fixed inset-x-0 bottom-0 z-40 flex h-[85dvh] flex-col overflow-hidden rounded-t-xl border border-stone-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[620px] sm:w-[400px] sm:rounded-xl"
    >
      <header className="flex items-center justify-between gap-2 bg-forest-800 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="font-medium">Larchgrove help · recordings</p>
          <p className="truncate text-xs text-forest-100">{playing ? replayWho(playing) : "Saved test conversations, not live"}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {playing && (
            <button type="button" onClick={() => setPlaying(null)} className="rounded px-2 py-1 text-xs text-forest-100 hover:bg-forest-700 hover:text-white">
              All recordings
            </button>
          )}
          <button type="button" onClick={close} aria-label="Close" className="rounded px-2 py-1 text-lg leading-none hover:bg-forest-700">
            ×
          </button>
        </div>
      </header>

      <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">
        {playing ? (
          <>
            Recording of a saved test conversation ({playing.run}, {playing.model.slice(playing.model.indexOf("/") + 1)}). Not live: nothing is sent anywhere.{" "}
            <a className="underline" href={`${SITE_ROOT}ops/${href.evalConversation(playing.run, playing.model, playing.caseId)}`}>
              Full trace
            </a>
          </>
        ) : (
          "This public copy has no live chat. These are real conversations from the held-out test run, played back as they happened."
        )}
      </p>

      {!playing ? (
        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="rounded bg-rust-50 p-2 text-sm text-rust-600">{error}</p>}
          {!replays && !error && <p className="text-sm text-stone-500">Loading…</p>}
          <ul className="space-y-2">
            {replays?.map((r) => (
              <li key={`${r.run}/${r.model}/${r.caseId}`}>
                <button type="button" onClick={() => play(r)} className="w-full rounded-lg border border-stone-200 px-3 py-2 text-left hover:border-forest-600 hover:bg-forest-50">
                  <span className="block text-sm font-medium text-stone-900">{r.title}</span>
                  <span className="block text-xs text-stone-500">{replayWho(r)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Recorded conversation">
            {view.messages.map((m, i) =>
              m.kind === "customer" ? (
                <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-forest-700 px-3 py-2 text-sm text-white">
                  {m.text}
                </div>
              ) : (
                <div key={i} className="max-w-[90%]">
                  <p className="mb-0.5 text-xs text-stone-500">{ANSWERED_BY_LABEL[m.answeredBy]}</p>
                  <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2 text-sm text-stone-900">{m.text}</div>
                </div>
              ),
            )}
            {view.progress && <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2 text-sm text-stone-600">{view.progress}</div>}
          </div>
          <div className="flex gap-2 border-t border-stone-200 p-3">
            {view.finished ? (
              <button type="button" onClick={() => play(playing)} className="flex-1 rounded-lg border border-stone-300 py-2 text-sm text-forest-800 hover:border-forest-600">
                Play again
              </button>
            ) : (
              <button type="button" onClick={() => setShown(events.length)} className="flex-1 rounded-lg border border-stone-300 py-2 text-sm text-forest-800 hover:border-forest-600">
                Skip to the end
              </button>
            )}
            <button type="button" onClick={() => setPlaying(null)} className="flex-1 rounded-lg bg-forest-700 py-2 text-sm font-medium text-white hover:bg-forest-800">
              Another recording
            </button>
          </div>
        </>
      )}
    </section>
  );
}
