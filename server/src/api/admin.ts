import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { fail } from "../tools/define.ts";

/**
 * Guards every dashboard action (approve, reject, switch, retire). M4 uses one
 * shared admin token from ADMIN_TOKEN, sent as `Authorization: Bearer <token>`;
 * M5 replaces this with a real admin login behind the same middleware. Reading
 * the dashboard stays public.
 *
 * ADMIN_TOKEN unset means actions are disabled, never open: a forgotten env
 * var must not turn into "anyone can approve refunds".
 */
export const MIN_ADMIN_TOKEN_LENGTH = 24;

// Both sides are hashed before comparing so timingSafeEqual always gets two
// 32-byte buffers: it requires equal lengths, and comparing the raw strings
// would leak the token's length (and, with ===, how many leading characters
// matched) through response timing.
const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Compares two secrets in constant time (admin token, chat tokens). */
export const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export function requireAdmin(token: string | undefined): MiddlewareHandler {
  if (token !== undefined && token !== "" && token.length < MIN_ADMIN_TOKEN_LENGTH) {
    throw new Error(`ADMIN_TOKEN must be at least ${MIN_ADMIN_TOKEN_LENGTH} characters (e.g. \`openssl rand -hex 24\`).`);
  }
  const expected = token ? digest(token) : null;
  return async (c, next) => {
    if (!expected) return c.json(fail("ADMIN_DISABLED", "Dashboard actions are disabled on this server (no ADMIN_TOKEN set)."), 403);
    const m = /^Bearer\s+(\S+)$/.exec(c.req.header("authorization") ?? "");
    if (!m || !timingSafeEqual(digest(m[1]!), expected)) {
      return c.json(fail("ADMIN_REQUIRED", "This action needs the admin token."), 401);
    }
    await next();
  };
}
