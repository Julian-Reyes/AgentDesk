import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getLiveRuns, sendMessage } from "./api.ts";

const chat = { conversationId: "c1", token: "tok" };

/** A streamed SSE response, delivered in the given chunks. */
function sse(chunks: string[], { breakAfter = false } = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      if (breakAfter) c.error(new Error("socket hang up"));
      else c.close();
    },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

const stubFetch = (res: Response | Error) => {
  const fn = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
};

afterEach(() => vi.unstubAllGlobals());

describe("sendMessage", () => {
  it("posts the text with the chat token, reports progress, returns the reply", async () => {
    const fetchFn = stubFetch(sse(['event: progress\ndata: {"label":"Looking up', ' your order…"}\n\nevent: re', 'ply\ndata: {"reply":"Shipped.","answeredBy":"support","outcome":"resolved"}\n\n']));
    const labels: string[] = [];
    const reply = await sendMessage(chat, "Where's #1042?", (l) => labels.push(l));
    expect(reply).toEqual({ reply: "Shipped.", answeredBy: "support", outcome: "resolved" });
    expect(labels).toEqual(["Looking up your order…"]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/chat/c1/messages");
    expect((init.headers as Record<string, string>)["x-chat-token"]).toBe("tok");
    expect(JSON.parse(String(init.body))).toEqual({ text: "Where's #1042?" });
  });

  it("throws the API's error for a refused message", async () => {
    stubFetch(Response.json({ ok: false, error: { code: "CHAT_NOT_FOUND", message: "This chat has ended." } }, { status: 404 }));
    await expect(sendMessage(chat, "hi", () => {})).rejects.toMatchObject({ code: "CHAT_NOT_FOUND", status: 404 });
  });

  it("throws on a server error event", async () => {
    stubFetch(sse(['event: error\ndata: {"code":"INTERNAL","message":"Something went wrong on our side."}\n\n']));
    await expect(sendMessage(chat, "hi", () => {})).rejects.toMatchObject({ code: "INTERNAL", message: "Something went wrong on our side." });
  });

  it("a stream that ends or breaks before the reply is a network error", async () => {
    stubFetch(sse(['event: progress\ndata: {"label":"x"}\n\n']));
    await expect(sendMessage(chat, "hi", () => {})).rejects.toMatchObject({ code: "NETWORK" });
    stubFetch(sse(['event: progress\ndata: {"label":"x"}\n\n'], { breakAfter: true }));
    await expect(sendMessage(chat, "hi", () => {})).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("an unreachable server, or a non-JSON error page, is a network error", async () => {
    stubFetch(new TypeError("fetch failed"));
    await expect(sendMessage(chat, "hi", () => {})).rejects.toBeInstanceOf(ApiError);
    stubFetch(new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    await expect(sendMessage(chat, "hi", () => {})).rejects.toMatchObject({ code: "NETWORK", status: 502 });
  });
});

describe("live traces are admin-only", () => {
  it("are requested from /api/admin with the token", async () => {
    const fetchFn = stubFetch(new Response(JSON.stringify({ ok: true, data: { runs: [], next: null } }), { headers: { "content-type": "application/json" } }));
    await getLiveRuns({ source: "demo,cli" }, "secret-token");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/runs?source=demo%2Ccli");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-token");
  });
});
