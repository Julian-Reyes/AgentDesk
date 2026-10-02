import { useEffect, useReducer, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, getPersonas, sendMessage, startChat, type Persona } from "../lib/api.ts";
import { ANSWERED_BY_LABEL, chatReducer, initialChat, outcomeBadge } from "./chat-state.ts";

const MAX_CHARS = 1000;

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useReducer(chatReducer, initialChat);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  // Bumped on reset, so a reply that arrives for an abandoned chat is dropped.
  const generation = useRef(0);

  useEffect(() => {
    if (open && !personas) getPersonas().then(setPersonas, (e: Error) => setPersonaError(e.message));
  }, [open, personas]);

  // Seconds since the message was sent: turns can take a while, and a moving
  // number shows it's still working.
  useEffect(() => {
    if (state.phase !== "waiting") return;
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  // Follow the conversation, but when a reply arrives, scroll to where it
  // starts: long answers would otherwise open at their last line.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const last = log.querySelector<HTMLElement>("[data-last-agent]");
    const bottom = log.scrollHeight;
    log.scrollTo({ top: last && state.phase === "ready" ? Math.min(bottom, last.offsetTop - 12) : bottom });
  }, [state.messages, state.progress, state.phase]);

  useEffect(() => {
    if (open && state.phase === "ready") inputRef.current?.focus();
  }, [open, state.phase]);

  const persona = personas?.find((p) => p.id === state.chat?.persona.id);

  async function choose(id: string) {
    const gen = ++generation.current;
    dispatch({ type: "start" });
    try {
      const chat = await startChat(id);
      if (gen === generation.current) dispatch({ type: "started", chat });
    } catch (e) {
      if (gen === generation.current) dispatch({ type: "startFailed", message: (e as Error).message });
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || state.phase !== "ready" || !state.chat) return;
    const gen = generation.current;
    dispatch({ type: "send", text: trimmed });
    setDraft("");
    try {
      const reply = await sendMessage(state.chat, trimmed, (label) => gen === generation.current && dispatch({ type: "progress", label }));
      if (gen === generation.current) dispatch({ type: "replied", reply });
    } catch (e) {
      if (gen !== generation.current) return;
      const err = e instanceof ApiError ? e : new ApiError("NETWORK", "Something went wrong. Please try again.", 0);
      dispatch({ type: "sendFailed", code: err.code, message: err.message, text: trimmed });
      // Give the unanswered message back, unless they already typed something new.
      if (err.code !== "CHAT_NOT_FOUND") setDraft((d) => d || trimmed);
    }
  }

  function reset() {
    generation.current += 1;
    dispatch({ type: "reset" });
    setDraft("");
  }

  function close() {
    setOpen(false);
    launcherRef.current?.focus();
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
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
        Chat with us
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Larchgrove chat"
      onKeyDown={(e) => e.key === "Escape" && close()}
      className="fixed inset-x-0 bottom-0 z-40 flex h-[85dvh] flex-col overflow-hidden rounded-t-xl border border-stone-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[620px] sm:w-[400px] sm:rounded-xl"
    >
      <header className="flex items-center justify-between gap-2 bg-forest-800 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="font-medium">Larchgrove help</p>
          <p className="truncate text-xs text-forest-100">
            {state.chat ? (state.chat.persona.signedIn ? `Signed in as ${state.chat.persona.label} (demo)` : "Not signed in (demo)") : "AI assistants for gear and orders"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {state.phase !== "pick" && (
            <button type="button" onClick={reset} className="rounded px-2 py-1 text-xs text-forest-100 hover:bg-forest-700 hover:text-white">
              New chat
            </button>
          )}
          <button type="button" onClick={close} aria-label="Close chat" className="rounded px-2 py-1 text-lg leading-none hover:bg-forest-700">
            ×
          </button>
        </div>
      </header>

      {state.phase === "pick" || state.phase === "starting" ? (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-stone-700">This is a demo. Choose who you are: a fictional customer with orders on file, or a visitor who isn't signed in.</p>
          <p className="mt-1 text-xs text-stone-500">The assistants can only see the chosen customer's orders.</p>
          {(state.error ?? personaError) && <p className="mt-3 rounded bg-rust-50 p-2 text-sm text-rust-600">{state.error ?? personaError}</p>}
          <ul className="mt-4 space-y-2">
            {(personas ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={state.phase === "starting"}
                  onClick={() => void choose(p.id)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-left hover:border-forest-600 hover:bg-forest-50 disabled:opacity-60"
                >
                  <span className="block text-sm font-medium text-stone-900">{p.label}</span>
                  <span className="block text-xs text-stone-500">{p.signedIn ? "Signed in, with orders on file" : "Product questions, deals, prices"}</span>
                </button>
              </li>
            ))}
          </ul>
          {!personas && !personaError && <p className="mt-4 text-sm text-stone-500">Loading…</p>}
          {state.phase === "starting" && <p className="mt-3 text-sm text-stone-500">Starting the chat…</p>}
        </div>
      ) : (
        <>
          <div ref={logRef} className="relative flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Conversation">
            <p className="text-sm text-stone-600">Hi! Ask about gear, prices and deals, or about an order you've placed.</p>
            {state.messages.length === 0 && persona && (
              <div className="flex flex-wrap gap-2" aria-label="Suggestions">
                {persona.tryThis.map((t) => (
                  <button key={t} type="button" onClick={() => void send(t)} className="rounded-full border border-forest-100 bg-forest-50 px-3 py-1 text-left text-xs text-forest-800 hover:border-forest-600">
                    {t}
                  </button>
                ))}
              </div>
            )}
            {state.messages.map((m, i) =>
              m.role === "customer" ? (
                <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-forest-700 px-3 py-2 text-sm text-white">
                  {m.text}
                </div>
              ) : m.role === "agent" ? (
                <div key={i} className="max-w-[90%]" {...(i === state.messages.length - 1 ? { "data-last-agent": "" } : {})}>
                  <p className="mb-0.5 text-xs text-stone-500">{ANSWERED_BY_LABEL[m.answeredBy]}</p>
                  {/* Plain text only: a reply is never rendered as HTML. */}
                  <div className="whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2 text-sm text-stone-900">{m.text}</div>
                  {outcomeBadge(m.outcome) && <p className="mt-1 inline-block rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">{outcomeBadge(m.outcome)}</p>}
                </div>
              ) : (
                <p key={i} className="rounded bg-stone-100 p-2 text-center text-xs text-stone-600">
                  {m.text}
                </p>
              ),
            )}
            {state.phase === "waiting" && (
              <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-stone-100 px-3 py-2 text-sm text-stone-600">
                <span className="inline-flex gap-1 align-middle" aria-hidden="true">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-400 [animation-delay:300ms]" />
                </span>{" "}
                {state.progress ?? "Thinking…"}
                {elapsed >= 3 && <span className="ml-1 text-xs text-stone-400">{elapsed}s</span>}
              </div>
            )}
          </div>

          {state.phase === "ended" ? (
            <div className="border-t border-stone-200 p-3">
              <button type="button" onClick={reset} className="w-full rounded-lg bg-forest-700 py-2 text-sm font-medium text-white hover:bg-forest-800">
                Start a new chat
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="border-t border-stone-200 p-3">
              {state.error && (
                <p role="alert" className="mb-2 rounded bg-rust-50 p-2 text-xs text-rust-600">
                  {state.error}
                </p>
              )}
              <div className="flex items-end gap-2">
                <label htmlFor="chat-input" className="sr-only">
                  Your message
                </label>
                <textarea
                  id="chat-input"
                  ref={inputRef}
                  rows={1}
                  maxLength={MAX_CHARS}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={state.phase === "waiting" ? "Waiting for the reply…" : "Type your message"}
                  className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-forest-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={state.phase !== "ready" || !draft.trim()}
                  className="h-10 rounded-lg bg-forest-700 px-4 text-sm font-medium text-white hover:bg-forest-800 disabled:bg-stone-300"
                >
                  Send
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
