import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
// vitest/config re-exports Vite's defineConfig and adds the `test` block.
import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * One Vite app with two pages: the storefront (index.html, with the chat
 * widget) and the ops dashboard (ops/index.html). In development, /api goes
 * to the API server (`npm run serve`).
 *
 * Ports come from the repo's .env (WEB_PORT, API_PORT), the same file the
 * server reads. Vite only loads .env files from its own folder by default,
 * hence loadEnv on the repo root ("" = all variables, not just VITE_*; they
 * stay in this config and never reach the browser bundle).
 */
const port = (value: string | undefined, fallback: number) => {
  const n = Number(value || fallback);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`Invalid port: ${value}`);
  return n;
};

/**
 * Static mode (VITE_STATIC=1, M5): the public GitHub Pages site reads the
 * exported API responses in ../site-data (npm run export:static) from
 * <base>/data/. This serves them in development and copies them into the build.
 */
const SITE_DATA = fileURLToPath(new URL("../site-data", import.meta.url));
function snapshotData(): Plugin {
  let outDir = "dist";
  return {
    name: "agentdesk-snapshot-data",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const prefix = `${server.config.base}data/`;
        if (!req.url?.startsWith(prefix)) return next();
        const file = join(SITE_DATA, decodeURIComponent(req.url.slice(prefix.length).split("?")[0]!));
        if (!file.startsWith(SITE_DATA) || !existsSync(file)) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader("content-type", "application/json");
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      if (!existsSync(SITE_DATA)) throw new Error("Static build: site-data/ is missing. Run npm run export:static first.");
      cpSync(SITE_DATA, join(outDir, "data"), { recursive: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "");
  const isStatic = env.VITE_STATIC === "1";
  return {
    // "/" locally; the Pages path (e.g. "/AgentDesk/") for the public site.
    base: env.VITE_BASE || "/",
    plugins: [react(), tailwindcss(), ...(isStatic ? [snapshotData()] : [])],
    server: {
      port: port(env.WEB_PORT, 5180),
      // Fail if the port is taken instead of quietly moving to the next one:
      // the printed URL would then differ from the one in the docs and bookmarks.
      strictPort: true,
      proxy: { "/api": { target: `http://127.0.0.1:${port(env.API_PORT || env.PORT, 8787)}` } },
    },
    // Two pages, one app: they share the API client and styles.
    build: { rollupOptions: { input: { store: fileURLToPath(new URL("index.html", import.meta.url)), ops: fileURLToPath(new URL("ops/index.html", import.meta.url)) } } },
    test: {
      include: ["src/**/*.test.ts"],
      environment: "node",
    },
  };
});
