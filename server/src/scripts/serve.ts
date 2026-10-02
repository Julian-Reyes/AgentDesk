/**
 * The API server for the storefront widget and the ops dashboard:
 *   npm run serve            (http://localhost:8787, or PORT from .env)
 *
 * In development, the web app's Vite dev server proxies /api here.
 * Dashboard actions need ADMIN_TOKEN in .env (see api/admin.ts).
 */
import { serve } from "@hono/node-server";
import { createApp } from "../api/app.ts";
import { connect } from "../db/client.ts";
import { storeClock } from "../domain/clock.ts";

const port = Number(process.env.PORT ?? 8787);
const { db, close } = connect();

let app: ReturnType<typeof createApp>;
try {
  app = createApp({ db, clock: storeClock(), now: () => new Date(), adminToken: process.env.ADMIN_TOKEN || undefined });
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
