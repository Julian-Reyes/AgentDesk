import { Hono } from "hono";
import type { Team } from "../agents/team.ts";
import type { DbOrTx } from "../db/client.ts";
import type { Clock } from "../domain/clock.ts";
import { fail, ok } from "../tools/define.ts";
import type { Tracer } from "../tracing/tracer.ts";
import { requireAdmin } from "./admin.ts";
import { ChatSessions, chatRoutes, type ChatLimits } from "./chat.ts";
import { productRoutes } from "./products.ts";

/**
 * The HTTP API behind the storefront widget and the ops dashboard.
 *
 * Everything it needs is passed in, so tests build it around a rolled-back
 * transaction and call `app.request()` directly: no port, no network, no
 * extra test library. `npm run serve` wires it to the real database.
 *
 * Responses use the same `{ ok: true, data } | { ok: false, error }` shape as
 * the tools, so the frontend handles one shape everywhere.
 */
export type AppDeps = {
  /** Store data (a rolled-back transaction in tests). */
  db: DbOrTx;
  /** The store's "today" (STORE_DATE), used for prices, windows and anything the tools see. */
  clock: Clock;
  /** Wall-clock time, for when things happened (decisions, traces). */
  now: () => Date;
  /** Shared admin token for dashboard actions; unset disables them (see admin.ts). */
  adminToken?: string;
  /** The agent team for a new chat (built per chat, so a model switch applies to the next one). */
  team: () => Team;
  /** Where chat traces go (DbTracer in the server, MemoryTracer in tests). */
  tracer: Tracer;
  chatLimits?: Partial<ChatLimits>;
  /** Where server errors are reported (default console.error). Tests capture them. */
  logError?: (err: Error) => void;
};

export function createApp(deps: AppDeps) {
  const admin = requireAdmin(deps.adminToken);
  const logError = deps.logError ?? ((err: Error) => console.error(err));
  const chats = new ChatSessions({ ...deps, logError, ...(deps.chatLimits ? { limits: deps.chatLimits } : {}) });

  const app = new Hono()
    // Every dashboard action lives under /api/admin/*, so one rule guards them
    // all and a new route can't forget it. Hono runs middleware in registration
    // order, so this must stay above every admin route.
    .use("/api/admin/*", admin)
    .get("/api/health", (c) => c.json(ok({ status: "up" })))
    .route("/api/products", productRoutes(deps))
    .route("/api/chat", chatRoutes(chats, logError))
    // The dashboard calls this to check a pasted token before showing actions.
    .get("/api/admin/check", (c) => c.json(ok({ admin: true })));

  app.notFound((c) => c.json(fail("NOT_FOUND", `No route ${c.req.method} ${c.req.path}.`), 404));
  // A bug or a database failure. The client gets a generic message; the details
  // go to the server log, never to the browser.
  app.onError((err, c) => {
    logError(err);
    return c.json(fail("INTERNAL", "Something went wrong on our side."), 500);
  });
  return app;
}

export type App = ReturnType<typeof createApp>;
