/**
 * The API server for the storefront widget and the ops dashboard:
 *   npm run serve            (http://localhost:8787, or API_PORT from .env)
 *
 * In development, the web app's Vite dev server proxies /api here.
 * Dashboard actions need ADMIN_TOKEN in .env (see api/admin.ts).
 */
import { serve } from "@hono/node-server";
import { buildTeam, loadTeamSpec } from "../agents/team.ts";
import { createApp } from "../api/app.ts";
import { connect } from "../db/client.ts";
import { storeClock } from "../domain/clock.ts";
import { DbTracer } from "../tracing/tracer.ts";

// API_PORT, as in .env; PORT is the fallback because hosting platforms set that one (M5).
const port = Number(process.env.API_PORT || process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid API_PORT: ${process.env.API_PORT || process.env.PORT}`);
  process.exit(1);
}
const { db, close } = connect();

let app: ReturnType<typeof createApp>;
try {
  // Build once at startup so an unknown model id or a missing API key fails
  // here, not on the first visitor's message. config/team.json (or MODEL)
  // until step 5 moves the team into the database.
  buildTeam(loadTeamSpec());
  app = createApp({
    db,
    clock: storeClock(),
    now: () => new Date(),
    team: () => buildTeam(loadTeamSpec()),
    // Traces get their own connection pool, like every other tracer user.
    tracer: new DbTracer(connect().db),
    adminToken: process.env.ADMIN_TOKEN || undefined,
  });
} catch (e) {
  console.error((e as Error).message);
  await close();
  process.exit(1);
}

// Local only until M5 (deploy) decides how the API is exposed.
const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`API on http://localhost:${info.port}  (admin actions ${process.env.ADMIN_TOKEN ? "enabled" : "disabled: no ADMIN_TOKEN"})`);
});

const shutdown = () => {
  server.close();
  void close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
