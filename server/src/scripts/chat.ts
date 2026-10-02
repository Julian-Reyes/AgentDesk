/**
 * Chat with the agent team in the terminal, against the dev database:
 *   npm run chat -- --as maya.chen@example.com --model groq/gpt-oss-120b
 *   npm run chat -- --model gemini/gemini-3.5-flash-lite      (anonymous visitor)
 *   npm run chat                                              (the dashboard's team from the DB, or MODEL in .env)
 *
 * --model <config-id> uses that model config (server/config/models.json) for
 * the router and both agents. It overrides MODEL and the team in the database.
 *
 * Every conversation is traced to Postgres; inspect one with
 *   npm run trace -- <run id>
 * Tools really run against the dev DB (refunds, approvals, coupons). Reseed
 * with `npm run db:seed` to reset the store.
 */
import { eq } from "drizzle-orm";
import { createInterface } from "node:readline/promises";
import { Conversation } from "../agents/conversation.ts";
import { loadDbTeamSpec } from "../agents/team-store.ts";
import { buildTeam, readTeamFile } from "../agents/team.ts";
import { connect } from "../db/client.ts";
import { customers } from "../db/schema.ts";
import { storeClock } from "../domain/clock.ts";
import { DbTracer } from "../tracing/tracer.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) {
    console.error(`${name} needs a value`);
    process.exit(1);
  }
  return value;
};
const asEmail = flag("--as");
const modelId = flag("--model");

const { db, close } = connect();
let team: ReturnType<typeof buildTeam>;
try {
  // The dashboard's team (database), unless --model or MODEL overrides it.
  const spec = await loadDbTeamSpec(db, readTeamFile(), new Date(), modelId ? { ...process.env, MODEL: modelId } : process.env);
  // Unknown ids and missing API keys fail here, before anything else starts.
  team = buildTeam(spec, {
    // Free tiers throttle hard (Groq: 8K tokens/min). Say so, instead of looking frozen.
    throttle: {
      onWait: (ms, reason, { label, limit }) =>
        console.log(`   (waiting ${Math.ceil(ms / 1000)}s: ${label} allows ${limit.toLocaleString("en-US")} ${reason === "tpm" ? "tokens" : "requests"}/min)`),
    },
  });
} catch (e) {
  console.error((e as Error).message);
  await close();
  process.exit(1);
}

try {
  let customer: { id: number; name: string; email: string } | null = null;
  if (asEmail) {
    const [c] = await db.select().from(customers).where(eq(customers.email, asEmail.toLowerCase()));
    if (!c) throw new Error(`No customer with email ${asEmail}`);
    customer = c;
  }

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
    console.log(`   [${r.outcome}, ${((performance.now() - started) / 1000).toFixed(1)}s]`);
    // The customer only sees the generic apology; the operator needs the real cause.
    if (r.error) console.log(`   error: ${r.error}`);
    console.log();
    process.stdout.write("you> ");
  }
  rl.close();
  console.log(`\nTrace: npm run trace -- ${convo.runId}`);
} finally {
  await close();
}
