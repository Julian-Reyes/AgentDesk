import { buildTeam, loadTeamSpec } from "../../src/agents/team.ts";
import { MIN_ADMIN_TOKEN_LENGTH } from "../../src/api/admin.ts";
import { createApp, type AppDeps } from "../../src/api/app.ts";
import type { Tx } from "../../src/db/client.ts";
import { fixedClock } from "../../src/domain/clock.ts";
import { FakeProvider, type FakeStep } from "../../src/llm/fake.ts";
import type { ChatProvider } from "../../src/llm/types.ts";
import { MemoryTracer } from "../../src/tracing/tracer.ts";

export const TOKEN = "t".repeat(MIN_ADMIN_TOKEN_LENGTH);

/**
 * The API around a rolled-back transaction, with scripted models (one script
 * for the router, one shared by both agents) and an in-memory tracer.
 * `wall` is the wall clock, movable to test chat expiry.
 */
export function testApp(
  tx: Tx,
  opts: { router?: FakeStep[]; agent?: FakeStep[]; providers?: { router: ChatProvider; agent: ChatProvider }; over?: Partial<AppDeps> } = {},
) {
  const router = new FakeProvider(opts.router ?? []);
  const agent = new FakeProvider(opts.agent ?? []);
  const fakes = opts.providers ?? { router, agent };
  const tracer = new MemoryTracer();
  const wall = { now: new Date("2026-10-02T12:00:00Z") };
  const errors: Error[] = [];
  const app = createApp({
    db: tx,
    clock: fixedClock("2026-09-15"),
    now: () => new Date(wall.now),
    team: () => buildTeam(loadTeamSpec({ MODEL: "fake" }), { fakes: { router: fakes.router, shopping: fakes.agent, support: fakes.agent }, env: {} }),
    tracer,
    adminToken: TOKEN,
    logError: (e) => errors.push(e),
    ...opts.over,
  });
  return { app, router, agent, tracer, wall, errors };
}

export const json = async (res: Response) => (await res.json()) as any;

/** Parses a Server-Sent Events body into its events. */
export async function sseEvents(res: Response): Promise<{ event: string; data: any }[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim() ?? "message";
      const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      return { event, data: JSON.parse(data) };
    });
}
