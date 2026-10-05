/**
 * Writes the public site's data (M5): every GET the static GitHub Pages site
 * makes, answered by the real API against the local dev database.
 *   npm run export:static            → site-data/ (commit it; the Pages workflow builds from it)
 *
 * Refuses to run with uncommitted changes (outside site-data/), so the commit
 * in the site's "data as of" footer is the code that produced the data.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { connect } from "../db/client.ts";
import { storeClock } from "../domain/clock.ts";
import { dirtyFiles, githubUrl } from "../static/git.ts";
import { exportSnapshot } from "../static/export.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

const dirty = dirtyFiles(git("status", "--porcelain"));
if (dirty.length) {
  console.error(`Commit or stash these first, so the snapshot's commit is the code that made it:\n  ${dirty.join("\n  ")}`);
  process.exit(1);
}

const now = new Date();
const meta = {
  exportedAt: now.toISOString().slice(0, 10),
  commit: git("rev-parse", "--short", "HEAD"),
  repoUrl: githubUrl(git("remote", "get-url", "origin")),
};
const { db, close } = connect();
try {
  const outDir = `${root}site-data`;
  const started = Date.now();
  const { files } = await exportSnapshot({ db, outDir, storeNow: storeClock()(), now, meta });
  console.log(`Wrote ${files} files to site-data/ in ${((Date.now() - started) / 1000).toFixed(1)} s (data as of ${meta.exportedAt}, commit ${meta.commit}).`);
  console.log("Review with: git status site-data/   then commit site-data/ and push; the Pages workflow deploys it.");
} finally {
  await close();
}
