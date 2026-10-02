import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { FAILURE_REPLY } from "../../src/agents/conversation.ts";
import { PERSONAS } from "../../src/api/personas.ts";
import { TOOL_PROGRESS, progressFor } from "../../src/api/progress.ts";
import * as s from "../../src/db/schema.ts";
import { FakeProvider, fake } from "../../src/llm/fake.ts";
import type { ChatProvider } from "../../src/llm/types.ts";
import { ALL_TOOLS } from "../../src/tools/registry.ts";
import type { Tracer } from "../../src/tracing/tracer.ts";
import { MAYA, inTx } from "../helpers.ts";
import { json, sseEvents, testApp } from "./helpers.ts";

const route = (r: string) => fake.json({ route: r, category: "order_status", urgency: "normal", confidence: 0.9 });

type App = ReturnType<typeof testApp>["app"];

async function start(app: App, persona = "maya") {
  const res = await app.request("/api/chat", { method: "POST", body: JSON.stringify({ persona }), headers: { "content-type": "application/json" } });
  return { res, body: await json(res) };
}

function send(app: App, id: string, token: string | undefined, text: unknown) {
  return app.request(`/api/chat/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
    headers: { "content-type": "application/json", ...(token ? { "x-chat-token": token } : {}) },
  });
}

describe("personas", () => {
  it("lists ids, labels and suggestions, without emails", () =>
    inTx(async (tx) => {
      const { data } = await json(await testApp(tx).app.request("/api/chat/personas"));
      expect(data.map((p: any) => p.id)).toEqual(["anonymous", "maya", "priya", "tom", "sofia"]);
      expect(JSON.stringify(data)).not.toContain("@");
      expect(data.find((p: any) => p.id === "anonymous").signedIn).toBe(false);
    }));

  it("each suggestion's order numbers belong to that persona (except the deliberate someone-else's-order one)", () =>
    inTx(async (tx) => {
      const deliberate: Record<string, number[]> = { maya: [1043], anonymous: [1042] };
      for (const p of PERSONAS) {
        const customer = p.email ? (await tx.select().from(s.customers).where(eq(s.customers.email, p.email)))[0] : null;
        if (p.email) expect(customer, p.id).toBeDefined();
        for (const n of p.tryThis.join(" ").match(/#\d+/g) ?? []) {
          const number = Number(n.slice(1));
          if (deliberate[p.id]?.includes(number)) continue;
          const [order] = await tx.select().from(s.orders).where(eq(s.orders.number, number));
          expect(order?.customerId, `${p.id} ${n}`).toBe(customer?.id);
        }
      }
    }));
});

describe("starting a chat", () => {
  it("as a signed-in persona: the app sets the customer, and the run is traced as a demo", () =>
    inTx(async (tx) => {
      const t = testApp(tx);
      const { res, body } = await start(t.app, "maya");
      expect(res.status).toBe(201);
      expect(body.data).toMatchObject({ persona: { id: "maya", label: "Maya Chen", signedIn: true } });
      expect(body.data.token.length).toBeGreaterThanOrEqual(32);
      const run = t.tracer.runs[0]!;
      expect(run).toMatchObject({ id: body.data.conversationId, source: "demo", customerId: MAYA, labels: { persona: "maya" } });
    }));

  it("as an anonymous visitor", () =>
    inTx(async (tx) => {
      const t = testApp(tx);
      const { body } = await start(t.app, "anonymous");
      expect(body.data.persona.signedIn).toBe(false);
      expect(t.tracer.runs[0]!.customerId).toBeNull();
    }));

  it("rejects an unknown persona or a bad body", () =>
    inTx(async (tx) => {
      const { app } = testApp(tx);
      const unknown = await start(app, "daniel-admin");
      expect(unknown.res.status).toBe(400);
      expect(unknown.body.error.code).toBe("UNKNOWN_PERSONA");
      const bad = await app.request("/api/chat", { method: "POST", body: "not json" });
      expect(bad.status).toBe(400);
      expect((await json(bad)).error.code).toBe("INVALID_BODY");
    }));
});

describe("sending a message", () => {
  it("streams progress, then the reply; the turn is traced", () =>
    inTx(async (tx) => {
      const t = testApp(tx, {
        router: [route("support")],
        agent: [fake.tools(["get_order", { orderId: 1042 }]), fake.tools(["get_tracking", { orderId: 1042 }]), fake.reply("It has shipped and is in Denver.")],
      });
      const { body } = await start(t.app);
      const res = await send(t.app, body.data.conversationId, body.data.token, "Where's my order?");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const raw = await res.clone().text();
      expect(await sseEvents(res)).toEqual([
        { event: "progress", data: { label: "Looking up your order…" } },
        { event: "progress", data: { label: "Checking tracking…" } },
        { event: "reply", data: { reply: "It has shipped and is in Denver.", answeredBy: "support", outcome: "resolved" } },
      ]);
      // Labels come from a fixed table: no tool names, arguments or results reach the browser.
      for (const leak of ["get_order", "orderId", "1042", "tracking\":"]) expect(raw).not.toContain(leak);
      const kinds = t.tracer.runs[0]!.steps.map((x) => x.kind);
      expect(kinds).toEqual(["user_message", "router", "model_call", "tool_call", "model_call", "tool_call", "model_call", "tool_call", "reply"]);
    }));

  it("keeps the conversation across messages (the agent holds it; no second routing)", () =>
    inTx(async (tx) => {
      const t = testApp(tx, { router: [route("support")], agent: [fake.reply("Which order?"), fake.reply("Thanks, looking at #1042.")] });
      const { body } = await start(t.app);
      const { conversationId: id, token } = body.data;
      await (await send(t.app, id, token, "Where's my order?")).text();
      const events = await sseEvents(await send(t.app, id, token, "#1042"));
      expect(events.at(-1)!.data.reply).toBe("Thanks, looking at #1042.");
      expect(t.router.requests).toHaveLength(1);
      expect(t.agent.requests[1]!.messages.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["Where's my order?", "#1042"]);
    }));

  it("a failed turn shows the customer the failure reply, never the cause", () =>
    inTx(async (tx) => {
      const t = testApp(tx, { router: [route("support")], agent: [new Error("groq HTTP 500: secret upstream detail")] });
      const { body } = await start(t.app);
      const res = await send(t.app, body.data.conversationId, body.data.token, "Where's my order?");
      const raw = await res.clone().text();
      expect(await sseEvents(res)).toEqual([{ event: "reply", data: { reply: FAILURE_REPLY, answeredBy: "support", outcome: "failed" } }]);
      expect(raw).not.toContain("secret");
      // The operator still sees the cause in the trace.
      expect(JSON.stringify(t.tracer.runs[0]!.steps)).toContain("secret upstream detail");
    }));

  it("an infrastructure failure becomes an error event, is logged, and frees the chat", () =>
    inTx(async (tx) => {
      const failing: Tracer = {
        startRun: async () => ({
          id: "run-x",
          step: async () => {
            throw new Error("trace db down: secret");
          },
          finish: async () => {},
        }),
      };
      const t = testApp(tx, { over: { tracer: failing } });
      const { body } = await start(t.app);
      const res = await send(t.app, "run-x", body.data.token, "hello");
      const raw = await res.clone().text();
      expect(await sseEvents(res)).toEqual([{ event: "error", data: { code: "INTERNAL", message: "Something went wrong on our side." } }]);
      expect(raw).not.toContain("secret");
      expect(t.errors[0]?.message).toContain("trace db down");
      // Not stuck "in progress": the next message gets through to the turn again.
      expect((await send(t.app, "run-x", body.data.token, "hello?")).status).toBe(200);
    }));
});

describe("who can send, and when", () => {
  it("needs the chat's own token", () =>
    inTx(async (tx) => {
      const t = testApp(tx);
      const a = (await start(t.app)).body.data;
      const b = (await start(t.app, "tom")).body.data;
      for (const token of [undefined, "", b.token, `${a.token}x`]) {
        const res = await send(t.app, a.conversationId, token, "hi");
        expect(res.status, String(token)).toBe(403);
        expect((await json(res)).error.code).toBe("CHAT_FORBIDDEN");
      }
    }));

  it("unknown chat, empty or too-long message", () =>
    inTx(async (tx) => {
      const t = testApp(tx);
      const { conversationId: id, token } = (await start(t.app)).body.data;
      expect((await send(t.app, "nope", token, "hi")).status).toBe(404);
      for (const text of ["", "   ", "x".repeat(1001), 42]) {
        const res = await send(t.app, id, token, text);
        expect(res.status, JSON.stringify(text).slice(0, 20)).toBe(400);
        expect((await json(res)).error.code).toBe("INVALID_MESSAGE");
      }
      expect(t.tracer.runs[0]!.steps).toHaveLength(0); // nothing reached the loop
    }));

  it("one turn at a time per chat", () =>
    inTx(async (tx) => {
      // A router call that stays open until the test releases it.
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const router = new FakeProvider([route("support")]);
      const gated: ChatProvider = { chat: async (req) => (await gate, router.chat(req)) };
      const t = testApp(tx, { providers: { router: gated, agent: new FakeProvider([fake.reply("Shipped.")]) } });
      const { conversationId: id, token } = (await start(t.app)).body.data;

      const first = await send(t.app, id, token, "Where's my order?");
      const second = await send(t.app, id, token, "Hello?");
      expect(second.status).toBe(409);
      expect((await json(second)).error.code).toBe("TURN_IN_PROGRESS");
      release();
      expect((await sseEvents(first)).at(-1)).toEqual({ event: "reply", data: { reply: "Shipped.", answeredBy: "support", outcome: "resolved" } });
    }));

  it("idle chats expire; the open-chat limit frees up when they do", () =>
    inTx(async (tx) => {
      const t = testApp(tx, { over: { chatLimits: { maxLive: 1, idleMs: 30 * 60_000 } } });
      const a = (await start(t.app)).body.data;
      const full = await start(t.app, "tom");
      expect(full.res.status).toBe(503);
      expect(full.body.error.code).toBe("CHAT_FULL");

      t.wall.now = new Date(t.wall.now.getTime() + 30 * 60_000 + 1);
      expect((await send(t.app, a.conversationId, a.token, "still there?")).status).toBe(404);
      expect((await start(t.app, "tom")).res.status).toBe(201);
    }));
});

describe("progress labels", () => {
  it("every tool has a label, and none is left over", () => {
    expect(Object.keys(TOOL_PROGRESS).sort()).toEqual(ALL_TOOLS.map((t) => t.name).filter((n) => n !== "reply").sort());
  });

  it("only model calls that run tools, and accepted handoffs, produce a label", () => {
    const call = (...names: string[]) => ({ turn: 1, kind: "model_call" as const, data: { message: { toolCalls: names.map((name) => ({ name })) } } });
    expect(progressFor(call("check_stock"))).toBe("Checking stock…");
    expect(progressFor(call("reply"))).toBeNull();
    expect(progressFor(call("handoff"))).toBeNull();
    expect(progressFor(call("reply", "quote_price"))).toBe("Calculating the price…");
    expect(progressFor(call("made_up_tool"))).toBe("Working on it…");
    expect(progressFor({ turn: 1, kind: "model_call", data: { message: { content: "hi" } } })).toBeNull();
    expect(progressFor({ turn: 1, kind: "handoff", data: { accepted: true, arguments: '{"to":"support","reason":"order"}' } })).toBe("Bringing in our orders & returns assistant…");
    expect(progressFor({ turn: 1, kind: "handoff", data: { accepted: false, arguments: '{"to":"support"}' } })).toBeNull();
    expect(progressFor({ turn: 1, kind: "tool_call", data: { name: "get_order" } })).toBeNull();
  });
});
