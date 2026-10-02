import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
// vitest/config re-exports Vite's defineConfig and adds the `test` block.
import { defineConfig } from "vitest/config";

/**
 * One Vite app with two pages: the storefront (index.html, with the chat
 * widget) and, from step 4, the ops dashboard (ops/index.html). In
 * development, /api goes to the API server (`npm run serve`, port 8787).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: `http://127.0.0.1:${process.env.API_PORT ?? 8787}` } },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
