/**
 * Turn rejected approvals into draft eval cases (see approvals/drafts.ts):
 *   npm run eval:draft-from-rejections
 * Reads the dev DB. Writes one file per rejection that came from a
 * conversation to src/evals/cases/drafts/, skipping drafts already written.
 * No model calls.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { customerMessages, DRAFTS_DIR, draftExists, draftFileName, rejectedWithRun, renderDraft } from "../approvals/drafts.ts";
import { connect } from "../db/client.ts";

const { db, close } = connect();
try {
  const rejected = await rejectedWithRun(db);
  mkdirSync(DRAFTS_DIR, { recursive: true });
  let written = 0;
  for (const r of rejected) {
    if (draftExists(DRAFTS_DIR, r.approval)) continue;
    const file = join(DRAFTS_DIR, draftFileName(r.approval));
    writeFileSync(file, renderDraft(r, await customerMessages(db, r.approval.runId)));
    console.log(`wrote ${relative(process.cwd(), file)}`);
    written += 1;
  }
  console.log(`${rejected.length} rejected approval(s) from conversations; ${written} new draft(s), ${rejected.length - written} already written.`);
} finally {
  await close();
}
