import { createInterface } from "node:readline/promises";

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
