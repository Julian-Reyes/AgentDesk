import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import * as s from "../db/schema.ts";
import { ok } from "../tools/define.ts";
import type { AppDeps } from "./app.ts";
import { progressFor } from "./progress.ts";
import { passedConversations, runsDeps } from "./runs.ts";

/**
 * Recordings for the public site's storefront chat (M5, Julian 2026-10-05):
 * the static site has no live chat, so the widget plays saved eval
 * conversations instead, clearly labelled as recordings. Curated in
 * config/replays.json and served only if the conversation passed, like the
 * overview's safety examples. Each turn carries what the live widget would
 * have shown: the customer's message, the progress labels, and the reply.
 */
export const REPLAYS_CONFIG = fileURLToPath(new URL("../../config/replays.json", import.meta.url));

const Replay = z.object({ title: z.string().min(1), run: z.string().min(1), model: z.string().min(1), caseId: z.string().min(1) }).strict();
const ReplaysConfig = z.object({ replays: z.array(Replay) }).strict();
export type ReplaysConfig = z.infer<typeof ReplaysConfig>;

export const loadReplaysConfig = (path = REPLAYS_CONFIG): ReplaysConfig => ReplaysConfig.parse(JSON.parse(readFileSync(path, "utf8")));

export type ReplaysDeps = { config: () => ReplaysConfig };

export function replayRoutes(deps: AppDeps) {
  const config = deps.replays?.config ?? (() => loadReplaysConfig());
  const r = runsDeps(deps);
  return new Hono().get("/", async (c) => {
    const passed = passedConversations(r);
    const found = config().replays.flatMap((p) => {
      const x = passed(p.run, p.model, p.caseId);
      return x ? [{ ...p, record: x.record }] : [];
    });
    // The signed-in customer's name, as the live widget's persona picker shows it (no emails).
    const emails = [...new Set(found.flatMap((f) => (f.record.case.customer ? [f.record.case.customer] : [])))];
    const names = new Map(
      emails.length ? (await deps.db.select({ email: s.customers.email, name: s.customers.name }).from(s.customers).where(inArray(s.customers.email, emails))).map((x) => [x.email, x.name]) : [],
    );
    const replays = found.map(({ record, ...p }) => ({
      ...p,
      customerName: record.case.customer ? (names.get(record.case.customer) ?? null) : null,
      turns: record.observation.turns.map((t, i) => {
        const labels = record.observation.steps.filter((st) => st.turn === i + 1).flatMap((st) => progressFor(st) ?? []);
        return { customer: t.customer, progress: labels.filter((l, j) => l !== labels[j - 1]), reply: t.reply, answeredBy: t.answeredBy };
      }),
    }));
    return c.json(ok({ replays }));
  });
}
