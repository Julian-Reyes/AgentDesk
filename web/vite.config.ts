import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
// vitest/config re-exports Vite's defineConfig and adds the `test` block.
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "");
  return {
    plugins: [react(), tailwindcss()],
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
