import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { staticPath } from "../../../web/src/lib/static-path.ts";
import * as s from "../../src/db/schema.ts";
import { exportSnapshot } from "../../src/static/export.ts";
import { dirtyFiles, githubUrl } from "../../src/static/git.ts";
import { TEST_NOW, db } from "../helpers.ts";
import { json, testApp } from "../api/helpers.ts";

const meta = { exportedAt: "2026-10-05", commit: "abc1234", repoUrl: "https://github.com/Julian-Reyes/AgentDesk" };
const now = new Date("2026-10-05T12:00:00Z");

function readAll(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.set(relative(dir, p), readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  return out;
}

describe("the static export (the public site's data)", () => {
  it("writes the API's own responses, identically on every run, with only the example approvals, and changes nothing in the database", async () => {
    const approvalsBefore = (await db.select().from(s.approvals)).length;
    const refundsBefore = (await db.select().from(s.refunds)).length;
    const a = mkdtempSync(join(tmpdir(), "snap-a-"));
    const b = mkdtempSync(join(tmpdir(), "snap-b-"));
    await exportSnapshot({ db, outDir: a, storeNow: TEST_NOW, now, meta });
    await exportSnapshot({ db, outDir: b, storeNow: TEST_NOW, now, meta: { ...meta, commit: "def5678" } });
    const first = readAll(a);
    const second = readAll(b);

    // Deterministic: the same files with the same bytes; only meta.json differs.
    expect([...second.keys()].sort()).toEqual([...first.keys()].sort());
    const changed = [...first.keys()].filter((k) => first.get(k) !== second.get(k));
    expect(changed).toEqual(["meta.json"]);

    // Each file is what the API answers for its path (spot checks across the page types).
    const app = testApp(db as never).app;
    for (const path of ["/api/overview", "/api/replays", "/api/comparison/test-1", "/api/eval-runs", "/api/eval-runs/pilot-1/conversations"]) {
      expect(JSON.parse(first.get(staticPath(path))!), path).toEqual(await json(await app.request(path)));
    }
    const conv = "/api/eval-runs/test-1/conversation?model=gemini%2Fgemini-3.5-flash-lite&case=test-adversarial-01";
    expect(JSON.parse(first.get(staticPath(conv))!)).toEqual(await json(await app.request(conv)));

    // One file per saved conversation in every run (pilot-1: 5).
    const runs = JSON.parse(first.get("api/eval-runs.json")!).data.runs as { name: string }[];
    for (const { name } of runs) {
      const rows = JSON.parse(first.get(`api/eval-runs/${name}/conversations.json`)!).data.conversations as unknown[];
      const files = [...first.keys()].filter((k) => k.startsWith(`api/eval-runs/${name}/conversation/`));
      expect(files.length, name).toBe(rows.length);
    }

    // Approvals: the 5 examples only, numbered 1–5 and marked, split by status like the API.
    const all = JSON.parse(first.get("api/approvals.json")!).data.approvals;
    expect(all.map((x: { id: number }) => x.id).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(all.every((x: { example: boolean; runId: null }) => x.example === true && x.runId === null)).toBe(true);
    expect(JSON.parse(first.get("api/approvals/status=pending.json")!).data.approvals).toHaveLength(3);
    expect(JSON.parse(first.get("api/approvals/status=approved.json")!).data.approvals).toHaveLength(1);
    expect(JSON.parse(first.get("api/approvals/status=rejected.json")!).data.approvals).toHaveLength(1);

    // Nothing written to the database: the examples were rolled back.
    expect((await db.select().from(s.approvals)).length).toBe(approvalsBefore);
    expect((await db.select().from(s.refunds)).length).toBe(refundsBefore);
    expect(JSON.parse(first.get("meta.json")!)).toEqual(meta);
  }, 300_000);

  it("git helpers: the export's own folder doesn't count as uncommitted; GitHub remotes become page links", () => {
    expect(dirtyFiles(" M site-data/api/overview.json\n?? site-data/x.json\n")).toEqual([]);
    expect(dirtyFiles(" M server/src/x.ts\n?? notes.md\n")).toEqual(["server/src/x.ts", "notes.md"]);
    expect(githubUrl("https://github.com/Julian-Reyes/AgentDesk.git")).toBe("https://github.com/Julian-Reyes/AgentDesk");
    expect(githubUrl("git@github.com:Julian-Reyes/AgentDesk.git")).toBe("https://github.com/Julian-Reyes/AgentDesk");
    expect(githubUrl("https://gitlab.com/a/b.git")).toBeNull();
  });
});
