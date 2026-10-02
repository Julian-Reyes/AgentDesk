import { describe, expect, it } from "vitest";
import { SseParser } from "./sse.ts";

describe("SseParser", () => {
  it("parses events, whatever the chunk boundaries", () => {
    const stream = 'event: progress\ndata: {"label":"Checking stock…"}\n\nevent: reply\ndata: {"reply":"Yes."}\n\n';
    // Every possible single split point gives the same events.
    for (let i = 0; i <= stream.length; i++) {
      const p = new SseParser();
      const events = [...p.push(stream.slice(0, i)), ...p.push(stream.slice(i))];
      expect(events, `split at ${i}`).toEqual([
        { event: "progress", data: '{"label":"Checking stock…"}' },
        { event: "reply", data: '{"reply":"Yes."}' },
      ]);
    }
  });

  it("holds an incomplete event until it ends", () => {
    const p = new SseParser();
    expect(p.push("event: reply\ndata: {}")).toEqual([]);
    expect(p.push("\n\n")).toEqual([{ event: "reply", data: "{}" }]);
  });

  it("handles CRLF, multi-line data, comments, default event name, and events without data", () => {
    const p = new SseParser();
    expect(p.push(": keep-alive\r\n\r\ndata: a\r\ndata: b\r\n\r\nevent: ping\n\n")).toEqual([{ event: "message", data: "a\nb" }]);
  });

  it("keeps a colon inside the value, and strips only one leading space", () => {
    const p = new SseParser();
    expect(p.push("data:  x: y\n\n")).toEqual([{ event: "message", data: " x: y" }]);
  });
});
