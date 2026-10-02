import { describe, expect, it } from "vitest";
import type { ChatStarted } from "../lib/api.ts";
import { chatReducer, initialChat, outcomeBadge, type ChatAction, type ChatState } from "./chat-state.ts";

const started: ChatStarted = { conversationId: "c1", token: "t", persona: { id: "maya", label: "Maya Chen", signedIn: true } };
const run = (actions: ChatAction[], from: ChatState = initialChat) => actions.reduce(chatReducer, from);
const ready = run([{ type: "start" }, { type: "started", chat: started }]);

describe("chat widget state", () => {
  it("start → ready → waiting with progress → reply", () => {
    const s = run([{ type: "send", text: "Where's #1042?" }, { type: "progress", label: "Checking tracking…" }], ready);
    expect(s).toMatchObject({ phase: "waiting", progress: "Checking tracking…" });
    const done = chatReducer(s, { type: "replied", reply: { reply: "Shipped.", answeredBy: "support", outcome: "resolved" } });
    expect(done.phase).toBe("ready");
    expect(done.progress).toBeNull();
    expect(done.messages).toEqual([
      { role: "customer", text: "Where's #1042?" },
      { role: "agent", text: "Shipped.", answeredBy: "support", outcome: "resolved" },
    ]);
  });

  it("can't send while a turn is running, or before the chat has started", () => {
    const waiting = run([{ type: "send", text: "a" }], ready);
    expect(chatReducer(waiting, { type: "send", text: "b" })).toBe(waiting);
    expect(chatReducer(initialChat, { type: "send", text: "a" })).toBe(initialChat);
  });

  it("late progress or replies after a reset are ignored", () => {
    expect(chatReducer(ready, { type: "progress", label: "x" })).toBe(ready);
    expect(chatReducer(initialChat, { type: "replied", reply: { reply: "x", answeredBy: "support", outcome: "resolved" } })).toBe(initialChat);
  });

  it("a failed send takes the message back out and shows the error", () => {
    const s = run([{ type: "send", text: "hello" }, { type: "sendFailed", code: "NETWORK", message: "Couldn't reach the store.", text: "hello" }], ready);
    expect(s).toMatchObject({ phase: "ready", error: "Couldn't reach the store.", messages: [] });
  });

  it("an expired chat ends with a notice", () => {
    const s = run([{ type: "send", text: "hello" }, { type: "sendFailed", code: "CHAT_NOT_FOUND", message: "ended", text: "hello" }], ready);
    expect(s.phase).toBe("ended");
    expect(s.messages.at(-1)).toMatchObject({ role: "notice" });
  });

  it("a failed start goes back to the persona picker with the error", () => {
    expect(run([{ type: "start" }, { type: "startFailed", message: "Too many chats" }])).toMatchObject({ phase: "pick", error: "Too many chats" });
  });

  it("badges only for outcomes the customer should notice", () => {
    expect(outcomeBadge("approval_needed")).toMatch(/approval/);
    expect(outcomeBadge("escalated")).toMatch(/person/);
    expect(outcomeBadge("resolved")).toBeNull();
    expect(outcomeBadge("failed")).toBeNull();
  });
});
