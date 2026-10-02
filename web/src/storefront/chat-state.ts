import type { AnsweredBy, ChatStarted, Outcome, Reply } from "../lib/api.ts";

/**
 * The chat widget's state, as a pure reducer: every change goes through one
 * function that tests can drive without a browser. The component only renders
 * the state and turns clicks and network results into actions.
 */
export type ChatMessage =
  | { role: "customer"; text: string }
  | { role: "agent"; text: string; answeredBy: AnsweredBy; outcome: Outcome }
  | { role: "notice"; text: string };

export type ChatState = {
  /** pick: choosing a persona · starting · ready: can type · waiting: a turn is running · ended: chat expired, start over */
  phase: "pick" | "starting" | "ready" | "waiting" | "ended";
  chat: ChatStarted | null;
  messages: ChatMessage[];
  /** The latest progress label while waiting. */
  progress: string | null;
  /** An error about the last action, shown above the input. */
  error: string | null;
};

export type ChatAction =
  | { type: "start" }
  | { type: "started"; chat: ChatStarted }
  | { type: "startFailed"; message: string }
  | { type: "send"; text: string }
  | { type: "progress"; label: string }
  | { type: "replied"; reply: Reply }
  | { type: "sendFailed"; code: string; message: string; text: string }
  | { type: "reset" };

export const initialChat: ChatState = { phase: "pick", chat: null, messages: [], progress: null, error: null };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "start":
      return { ...initialChat, phase: "starting" };
    case "started":
      return { ...state, phase: "ready", chat: action.chat, error: null };
    case "startFailed":
      return { ...state, phase: "pick", error: action.message };
    case "send":
      if (state.phase !== "ready") return state;
      return { ...state, phase: "waiting", progress: null, error: null, messages: [...state.messages, { role: "customer", text: action.text }] };
    case "progress":
      return state.phase === "waiting" ? { ...state, progress: action.label } : state;
    case "replied":
      if (state.phase !== "waiting") return state;
      return {
        ...state,
        phase: "ready",
        progress: null,
        messages: [...state.messages, { role: "agent", text: action.reply.reply, answeredBy: action.reply.answeredBy, outcome: action.reply.outcome }],
      };
    case "sendFailed": {
      if (action.code === "CHAT_NOT_FOUND") {
        return { ...state, phase: "ended", progress: null, error: null, messages: [...state.messages, { role: "notice", text: "This chat has ended after a period of inactivity. Start a new one to continue." }] };
      }
      // The message never got an answer: take it back out of the transcript
      // and offer it again in the input, so the customer can just resend.
      const messages = [...state.messages];
      const last = messages.at(-1);
      if (last?.role === "customer" && last.text === action.text) messages.pop();
      return { ...state, phase: "ready", progress: null, error: action.message, messages };
    }
    case "reset":
      return initialChat;
  }
}

export const ANSWERED_BY_LABEL: Record<AnsweredBy, string> = {
  shopping: "Shopping assistant",
  support: "Orders & returns",
  router: "Larchgrove",
};

/** A badge for outcomes the customer should notice; the reply text explains it. */
export function outcomeBadge(outcome: Outcome): string | null {
  if (outcome === "approval_needed") return "Sent to our team for approval";
  if (outcome === "escalated") return "Passed to a person";
  return null;
}
