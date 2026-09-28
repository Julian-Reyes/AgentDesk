/**
 * Call one tool by hand, exactly as an agent would:
 *   npm run tool -- get_order '{"orderId":1042}' --as maya.chen@example.com
 *   npm run tool -- quote_price '{"cart":[{"productId":"tent-ridge-2","qty":2}],"coupon":"SUMMER10"}'
 *   npm run tool -- list
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { connect } from "../db/client.ts";
import { customers } from "../db/schema.ts";
import { storeClock } from "../domain/clock.ts";
import { callTool } from "../tools/define.ts";
import { ALL_TOOLS, getTool } from "../tools/registry.ts";

const args = process.argv.slice(2);
const asIndex = args.indexOf("--as");
const asEmail = asIndex >= 0 ? args[asIndex + 1] : undefined;
const [name, json = "{}"] = args.filter((_, i) => asIndex < 0 || (i !== asIndex && i !== asIndex + 1));

if (!name || name === "list") {
  for (const t of ALL_TOOLS) {
    console.log(`${t.name}  [${t.agents.join(", ")}]\n  ${t.description}\n  args: ${JSON.stringify(z.toJSONSchema(t.args, { io: "input" }))}\n`);
  }
  process.exit(0);
}

const tool = getTool(name);
if (!tool) {
  console.error(`Unknown tool "${name}". Try: npm run tool -- list`);
  process.exit(1);
}

const { db, close } = connect();
try {
  let customerId: number | null = null;
  if (asEmail) {
    const [c] = await db.select().from(customers).where(eq(customers.email, asEmail.toLowerCase()));
    if (!c) throw new Error(`No customer with email ${asEmail}`);
    customerId = c.id;
  }
  const result = await callTool(tool, { db, now: storeClock()(), session: { customerId } }, JSON.parse(json));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await close();
}
