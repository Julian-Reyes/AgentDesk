/**
 * Chat with the agent team in the terminal, against the dev database:
 *   npm run chat -- --as maya.chen@example.com
 *   MODEL=groq/gpt-oss-120b npm run chat          (anonymous visitor)
 *
 * Every conversation is traced to Postgres; inspect one with
 *   npm run trace -- <run id>
 * Tools really run against the dev DB (refunds, approvals, coupons). Reseed
 * with `npm run db:seed` to reset the store.
 */
import { eq } from "drizzle-orm";
import { createInterface } from "node:readline/promises";
import { Conversation } from "../agents/conversation.ts";
import { buildTeam, loadTeamSpec } from "../agents/team.ts";
import { connect } from "../db/client.ts";
import { customers } from "../db/schema.ts";
import { storeClock } from "../domain/clock.ts";
import { DbTracer } from "../tracing/tracer.ts";

const args = process.argv.slice(2);
const asIndex = args.indexOf("--as");
const asEmail = asIndex >= 0 ? args[asIndex + 1] : undefined;

const { db, close } = connect();
try {
  let customer: { id: number; name: string; email: string } | null = null;
  if (asEmail) {
    const [c] = await db.select().from(customers).where(eq(customers.email, asEmail.toLowerCase()));
    if (!c) throw new Error(`No customer with email ${asEmail}`);
    customer = c;
  }

  const team = buildTeam(loadTeamSpec());
  const convo = await Conversation.start({
    db,
    clock: storeClock(),
    session: { customerId: customer?.id ?? null },
    customer: customer ? { name: customer.name, email: customer.email } : null,
    router: team.router,
    agents: team.agents,
    tracer: new DbTracer(db),
    source: "cli",
    team: team.meta,
  });

  console.log(`Larchgrove Supply Co. chat, ${customer ? `signed in as ${customer.name}` : "anonymous visitor"}.`);
  console.log(`Models: ${Object.entries(team.meta).map(([role, m]) => `${role}=${m.model}`).join(", ")}`);
  console.log(`Run ${convo.runId}. Empty line or Ctrl-D to quit.\n`);

  // Read lines with the async iterator rather than rl.question(): it buffers
  // input, so piped scripts (printf "q1\nq2\n" | npm run chat) don't lose lines
  // that arrive while the agent is still answering.
  const rl = createInterface({ input: process.stdin });
  const interactive = process.stdin.isTTY;
  process.stdout.write("you> ");
  for await (const line of rl) {
    const text = line.trim();
    if (!text) break;
    if (!interactive) console.log(text); // echo piped input so the transcript reads naturally
    const started = performance.now();
    const r = await convo.send(text);
    console.log(`${r.answeredBy}> ${r.reply}`);
    console.log(`   [${r.outcome}, ${((performance.now() - started) / 1000).toFixed(1)}s]\n`);
    process.stdout.write("you> ");
  }
  rl.close();
  console.log(`\nTrace: npm run trace -- ${convo.runId}`);
} finally {
  await close();
}
