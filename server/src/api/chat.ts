import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { Conversation } from "../agents/conversation.ts";
import type { Team } from "../agents/team.ts";
import type { DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import type { Clock } from "../domain/clock.ts";
import { fail, ok } from "../tools/define.ts";
import type { Tracer } from "../tracing/tracer.ts";
import { sameSecret } from "./admin.ts";
import { PERSONAS, personaById } from "./personas.ts";
import { ObservingTracer, progressFor } from "./progress.ts";

/**
 * Live storefront chats.
 *
 * A Conversation keeps its state in memory (who holds the chat, the agent's
 * working messages), so the server keeps the live ones in a map. Each chat
 * gets a random token when it starts; only the browser that holds it can send
 * messages, so knowing a conversation id (it's the run id, which the
 * dashboard shows) isn't enough to write into someone else's chat.
 *
 * Restarting the server ends live chats; their traces stay in the database.
 * That's fine for one instance; M5 revisits it for hosting.
 */
export type ChatLimits = {
  /** A chat idle this long is dropped. */
  idleMs: number;
  /** Live chats at once; beyond this, new chats are refused until some expire. */
  maxLive: number;
  /** Longest customer message, in characters. */
  maxMessageChars: number;
};
export const DEFAULT_CHAT_LIMITS: ChatLimits = { idleMs: 30 * 60_000, maxLive: 200, maxMessageChars: 1000 };

export type ChatDeps = {
  db: DbOrTx;
  clock: Clock;
  now: () => Date;
  /** Built for each new chat, so a model switch applies to the next conversation. */
  team: () => Team | Promise<Team>;
  tracer: Tracer;
  limits?: Partial<ChatLimits>;
  logError: (err: Error) => void;
};

type LiveChat = {
  convo: Conversation;
  tracer: ObservingTracer;
  token: string;
  persona: string;
  lastUsed: number;
  busy: boolean;
};

export class ChatSessions {
  private readonly chats = new Map<string, LiveChat>();
  readonly limits: ChatLimits;
  private readonly deps: ChatDeps;
  constructor(deps: ChatDeps) {
    this.deps = deps;
    this.limits = { ...DEFAULT_CHAT_LIMITS, ...deps.limits };
  }

  get size() {
    return this.chats.size;
  }

  /** Drops idle chats. A chat in the middle of a turn is never dropped. */
  sweep() {
    const now = this.deps.now().getTime();
    for (const [id, chat] of this.chats) if (!chat.busy && now - chat.lastUsed > this.limits.idleMs) this.chats.delete(id);
  }

  async start(personaId: string) {
    const persona = personaById(personaId);
    if (!persona) return fail("UNKNOWN_PERSONA", `persona must be one of: ${PERSONAS.map((p) => p.id).join(", ")}.`);
    this.sweep();
    if (this.chats.size >= this.limits.maxLive) return fail("CHAT_FULL", "Too many chats are open right now. Please try again in a few minutes.");

    let customer: { id: number; name: string; email: string } | null = null;
    if (persona.email) {
      const [c] = await this.deps.db.select().from(s.customers).where(eq(s.customers.email, persona.email));
      if (!c) throw new Error(`Persona ${persona.id}'s customer ${persona.email} is missing from the database (reseed?)`);
      customer = { id: c.id, name: c.name, email: c.email };
    }

    const team = await this.deps.team();
    const tracer = new ObservingTracer(this.deps.tracer);
    const convo = await Conversation.start({
      db: this.deps.db,
      clock: this.deps.clock,
      session: { customerId: customer?.id ?? null },
      customer: customer ? { name: customer.name, email: customer.email } : null,
      router: team.router,
      agents: team.agents,
      tracer,
      source: "demo",
      team: team.meta,
      labels: { persona: persona.id },
    });
    const token = randomBytes(24).toString("base64url");
    this.chats.set(convo.runId, { convo, tracer, token, persona: persona.id, lastUsed: this.deps.now().getTime(), busy: false });
    return ok({ conversationId: convo.runId, token, persona: { id: persona.id, label: persona.label, signedIn: customer !== null } });
  }

  /** Checks everything that can be refused before the turn starts, so refusals are plain JSON errors, not a stream. */
  claim(id: string, token: string | undefined) {
    this.sweep();
    const chat = this.chats.get(id);
    if (!chat) return { status: 404 as const, result: fail("CHAT_NOT_FOUND", "This chat has ended. Please start a new one.") };
    if (!token || !sameSecret(token, chat.token)) return { status: 403 as const, result: fail("CHAT_FORBIDDEN", "This chat belongs to another session.") };
    if (chat.busy) return { status: 409 as const, result: fail("TURN_IN_PROGRESS", "Please wait for the reply to your last message.") };
    chat.busy = true;
    return { status: 200 as const, chat };
  }

  release(chat: LiveChat) {
    chat.busy = false;
    chat.lastUsed = this.deps.now().getTime();
  }
}

const StartBody = z.object({ persona: z.string() });

export function chatRoutes(sessions: ChatSessions, logError: (err: Error) => void) {
  const Message = z.object({ text: z.string().trim().min(1).max(sessions.limits.maxMessageChars) });

  return new Hono()
    .get("/personas", (c) => c.json(ok(PERSONAS.map(({ id, label, tryThis, email }) => ({ id, label, tryThis, signedIn: email !== null })))))
    .post("/", async (c) => {
      const body = StartBody.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json(fail("INVALID_BODY", 'Send { "persona": "<id>" }.'), 400);
      const r = await sessions.start(body.data.persona);
      if (!r.ok) return c.json(r, r.error.code === "CHAT_FULL" ? 503 : 400);
      return c.json(r, 201);
    })
    .post("/:id/messages", async (c) => {
      const body = Message.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json(fail("INVALID_MESSAGE", `Send { "text": "…" }, 1–${sessions.limits.maxMessageChars} characters.`), 400);
      const claimed = sessions.claim(c.req.param("id"), c.req.header("x-chat-token"));
      if (claimed.status !== 200) return c.json(claimed.result, claimed.status);
      const { chat } = claimed;

      // The turn runs to completion even if the browser goes away (a refund
      // half-done because a tab closed would be worse). Events are written
      // only while the stream is open.
      return streamSSE(c, async (stream) => {
        const send = (event: string, data: unknown) => (stream.aborted ? Promise.resolve() : stream.writeSSE({ event, data: JSON.stringify(data) }));
        let lastLabel: string | null = null;
        chat.tracer.listener = (step) => {
          const label = progressFor(step);
          if (label && label !== lastLabel) {
            lastLabel = label;
            void send("progress", { label });
          }
        };
        try {
          // send() never throws for model or tool trouble: it returns the
          // failure reply and records the cause in the trace. `error` (the
          // cause) is for operators only, so it isn't sent to the browser.
          const { reply, answeredBy, outcome } = await chat.convo.send(body.data.text);
          await send("reply", { reply, answeredBy, outcome });
        } catch (e) {
          // Only infrastructure failures get here (e.g. the trace database).
          logError(e as Error);
          await send("error", { code: "INTERNAL", message: "Something went wrong on our side." });
        } finally {
          chat.tracer.listener = null;
          sessions.release(chat);
        }
      });
    });
}
