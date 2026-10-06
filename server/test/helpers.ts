import { afterAll } from "vitest";
import { connect, type Tx } from "../src/db/client.ts";
import { fixedClock } from "../src/domain/clock.ts";
import { callTool, type ToolContext, type ToolResult } from "../src/tools/define.ts";
import { getTool } from "../src/tools/registry.ts";

export const TEST_NOW = fixedClock("2026-09-15")();

/** Seeded customer ids (see seed/data.ts ANCHOR_CUSTOMERS). */
export const MAYA = 1;
export const DANIEL = 2;
export const PRIYA = 3;
export const TOM = 4;
export const SOFIA = 5;

const { db, close } = connect(process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/agentdesk_test");
afterAll(close);
export { db };

class Rollback extends Error {}

/**
 * Runs `fn` inside a transaction that is always rolled back, so tests can
 * write refunds/approvals without affecting each other.
 */
export async function inTx(fn: (tx: Tx) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

/** Call a tool by name, as the agent loop will. */
export function call(
  tx: Tx,
  name: string,
  args: unknown,
  session: ToolContext["session"] = { customerId: null },
  extra: Partial<Pick<ToolContext, "customerMessages">> = {},
): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) throw new Error(`No tool ${name}`);
  return callTool(tool, { db: tx, now: TEST_NOW, session, ...extra }, args);
}

export const as = (customerId: number) => ({ customerId });
