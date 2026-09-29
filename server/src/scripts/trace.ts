/**
 * Print a traced run step by step (until the M4 dashboard's Runs page exists):
 *   npm run trace -- <run id>
 *   npm run trace              (lists the 10 most recent runs)
 */
import { asc, desc, eq } from "drizzle-orm";
import { connect } from "../db/client.ts";
import { runSteps, runs } from "../db/schema.ts";

const runId = process.argv[2];
const { db, close } = connect();
const short = (v: unknown, n = 160) => {
  const t = typeof v === "string" ? v : JSON.stringify(v);
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

try {
  if (!runId) {
    const recent = await db.select().from(runs).orderBy(desc(runs.startedAt)).limit(10);
    for (const r of recent) {
      console.log(`${r.id}  ${r.startedAt.toISOString()}  ${r.source.padEnd(5)} ${String(r.outcome ?? "-").padEnd(15)} turns=${r.turns} tokens=${r.inputTokens}/${r.outputTokens}`);
    }
  } else {
    const [run] = await db.select().from(runs).where(eq(runs.id, runId));
    if (!run) throw new Error(`No run ${runId}`);
    console.log(`Run ${run.id} (${run.source}), customer ${run.customerId ?? "anonymous"}, outcome ${run.outcome}, ${run.turns} turns`);
    console.log(`Tokens in/out: ${run.inputTokens}/${run.outputTokens}, cost $${(run.costMicros / 1e6).toFixed(6)}`);
    console.log(`Team: ${JSON.stringify(run.team)}\n`);
    const steps = await db.select().from(runSteps).where(eq(runSteps.runId, runId)).orderBy(asc(runSteps.seq));
    for (const s of steps) {
      const d = s.data as Record<string, any>;
      const head = `#${s.seq} t${s.turn} ${s.kind.padEnd(12)} ${(s.agent ?? "").padEnd(8)}`;
      const perf = s.latencyMs != null ? ` [${s.latencyMs}ms, ${s.inputTokens}/${s.outputTokens} tok${s.cached ? ", cached" : ""}]` : "";
      let body: string;
      switch (s.kind) {
        case "user_message": body = short(d.text); break;
        case "router": body = d.error ? `invalid (${short(d.error, 80)})` : short(d.decision); break;
        case "model_call": body = d.message?.toolCalls ? d.message.toolCalls.map((c: any) => `${c.name}(${short(c.arguments, 80)})`).join(", ") : short(d.message?.content); break;
        case "tool_call": body = `${d.name} → ${short(d.result, 140)}${s.policyDecision ? ` {${s.policyDecision}}` : ""}`; break;
        case "reply": body = `${d.implicit ? "(implicit) " : ""}${short(d.message, 200)}`; break;
        default: body = short(d);
      }
      console.log(`${head} ${body}${perf}`);
    }
  }
} finally {
  await close();
}
