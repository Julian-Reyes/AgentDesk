import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { staticPath } from "../../../web/src/lib/static-path.ts";
import { createApp, type AppDeps } from "../api/app.ts";
import type { Db } from "../db/client.ts";
import { seedDemoApprovals } from "../seed/demo-approvals.ts";
import { MemoryTracer } from "../tracing/tracer.ts";

/**
 * The public site's data (M5, Julian 2026-10-05): every GET the static site
 * makes, answered by the real API in-process (no port, no network) and
 * written to <outDir>/<staticPath(path)>. The static build reads these files
 * instead of calling the API, so the public site shows exactly what the API
 * returns.
 *
 * Deterministic: the same data gives the same bytes, so files that didn't
 * change don't change in git. The only file that changes on every export is
 * meta.json (the date and commit).
 *
 * Read-only on the database. The Approvals page shows only the example
 * approvals (seed/demo-approvals.ts), added inside a transaction that is
 * rolled back, never Julian's own local approvals.
 */
export type ExportOptions = {
  db: Db;
  outDir: string;
  /** The store's "today", which the tools see when the example approvals are made. */
  storeNow: Date;
  /** Wall-clock time (the Agents page's live-metrics window). */
  now: Date;
  meta: { exportedAt: string; commit: string; repoUrl: string | null };
  /** Test hook: overrides for the API's file-based parts (results dir, configs). */
  over?: Partial<AppDeps>;
};

const APPROVAL_FILTERS = ["", "?status=pending", "?status=approved", "?status=rejected"];

class Rollback extends Error {}

export async function exportSnapshot(o: ExportOptions): Promise<{ files: number }> {
  rmSync(o.outDir, { recursive: true, force: true });
  let files = 0;
  const write = (path: string, data: unknown) => {
    const file = join(o.outDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    files += 1;
  };

  const app = (db: AppDeps["db"]) =>
    createApp({
      db,
      clock: () => o.storeNow,
      now: () => o.now,
      team: () => {
        throw new Error("The static export never starts a chat.");
      },
      tracer: new MemoryTracer(),
      ...o.over,
      // Each saved run is graded once for the whole export.
      runs: { cache: new Map(), ...o.over?.runs },
    });

  const api = app(o.db);
  const get = async (path: string) => {
    const res = await api.request(path);
    const body = (await res.json()) as { ok: boolean; data?: unknown; error?: unknown };
    if (!res.ok || !body.ok) throw new Error(`Export: GET ${path} failed (${res.status}): ${JSON.stringify(body.error ?? body)}`);
    return body;
  };
  const save = async (path: string) => {
    const body = await get(path);
    write(staticPath(path), body);
    return body.data;
  };

  // The dashboard and the storefront.
  for (const path of ["/api/overview", "/api/replays", "/api/agents", "/api/products", "/api/chat/personas"]) await save(path);
  const list = (await save("/api/comparison")) as { sets: { id: string; generated: boolean }[] };
  for (const set of list.sets.filter((s) => s.generated)) await save(`/api/comparison/${encodeURIComponent(set.id)}`);

  // Every saved eval run, with one file per conversation (loaded on demand).
  const runs = (await save("/api/eval-runs")) as { runs: { name: string }[] };
  for (const { name } of runs.runs) {
    const run = (await save(`/api/eval-runs/${encodeURIComponent(name)}/conversations`)) as { conversations: { model: string; caseId: string }[] };
    for (const c of run.conversations) await save(`/api/eval-runs/${encodeURIComponent(name)}/conversation?${new URLSearchParams({ model: c.model, case: c.caseId })}`);
  }

  // Approvals: only the examples, made inside a transaction that's rolled back.
  try {
    await o.db.transaction(async (tx) => {
      const ids = await seedDemoApprovals(tx, o.storeNow);
      const txApi = app(tx);
      // Database ids depend on the sequence, so the examples are numbered 1, 2, … in the order they were made.
      const number = new Map(ids.map((id, i) => [id, i + 1]));
      for (const filter of APPROVAL_FILTERS) {
        const path = `/api/approvals${filter}`;
        const res = await txApi.request(path);
        const body = (await res.json()) as { ok: boolean; data: { approvals: { id: number }[] } };
        if (!body.ok) throw new Error(`Export: GET ${path} failed`);
        const approvals = body.data.approvals.filter((a) => number.has(a.id)).map((a) => ({ ...a, id: number.get(a.id)!, example: true }));
        write(staticPath(path), { ok: true, data: { approvals } });
      }
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }

  write("meta.json", o.meta);
  return { files };
}
