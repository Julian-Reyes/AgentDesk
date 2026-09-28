import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema.ts";
import { defineTool, fail, ok } from "./define.ts";

export const getPolicy = defineTool({
  name: "get_policy",
  description: `Read a store policy. Topics: ${s.POLICY_TOPICS.join(", ")}.`,
  agents: ["shopping", "support"],
  args: z.object({ topic: z.enum(s.POLICY_TOPICS) }),
  async run(ctx, { topic }) {
    const [policy] = await ctx.db.select().from(s.policies).where(eq(s.policies.topic, topic));
    if (!policy) return fail("POLICY_NOT_FOUND", `No policy for "${topic}".`);
    return ok({ topic: policy.topic, title: policy.title, text: policy.body });
  },
});

/**
 * The agent's message to the customer. In M1 this only validates the text;
 * the M2 loop treats it as the end of the agent's turn, and the M3 grounding
 * check inspects it.
 */
export const reply = defineTool({
  name: "reply",
  description: "Send your message to the customer. This ends your turn.",
  agents: ["shopping", "support"],
  args: z.object({ message: z.string().trim().min(1).max(2000) }),
  async run(_ctx, { message }) {
    return ok({ delivered: true, message });
  },
});

export const SHARED_TOOLS = [getPolicy, reply];
