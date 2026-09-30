import { createInterface } from "node:readline/promises";
import type { JudgeEvent } from "./stages.ts";

/** Asks y/N on a terminal. Without a terminal (piped/CI), never starts a real run: returns false. */
export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

export const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`;
};

/** Throttle waits of 5 s or more are worth a line; shorter ones would drown the progress output. */
export const throttleNotice = {
  onWait: (ms: number, reason: "rpm" | "tpm", { label, limit }: { label: string; limit: number }) => {
    if (ms >= 5000) console.log(`   (waiting ${Math.ceil(ms / 1000)}s: ${label} allows ${limit.toLocaleString("en-US")} ${reason === "tpm" ? "tokens" : "requests"}/min)`);
  },
};

const JUDGE_RESULT = { ok: "ok", judge_failed: "judge failed (invalid output)", provider_error: "provider error (will retry)" } as const;

export function judgeEventLine(e: JudgeEvent): string {
  if (e.kind === "judged") return `[judge] ${e.index}/${e.total} ${e.model} ${e.caseId}: ${JUDGE_RESULT[e.result]}${e.result === "ok" ? ` in ${duration(e.latencyMs)}` : ""}`;
  if (e.kind === "retrying") return `[judge] retry pass ${e.pass}: ${e.count} provider error(s); waiting ${duration(e.waitMs)} first`;
  return `[judge] STOPPED with ${e.remaining} left: ${e.reason.slice(0, 160)}`;
}

/** After judging: how many conversations still have no verdict, with a warning above 10% (Julian's threshold for switching judges). */
export function coverageNote(c: { unjudged: number; total: number }, judgeModel: string): string {
  if (c.unjudged === 0) return `[judge] every conversation has a verdict from ${judgeModel}.`;
  const share = c.unjudged / c.total;
  const line = `[judge] ${c.unjudged} of ${c.total} conversations (${Math.round(share * 100)}%) still have no verdict from ${judgeModel} (provider errors).`;
  return share > 0.1 ? `${line}\n[judge] WARNING: that's over 10%. Julian's rule: report it and consider switching the judge (judges.main in config/models.json).` : `${line} Rerun eval:judge later to retry them.`;
}
