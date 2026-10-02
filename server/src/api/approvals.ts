import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { approve, reject, type DecisionContext } from "../approvals/decide.ts";
import { DRAFTS_DIR, draftExists } from "../approvals/drafts.ts";
import { APPROVAL_STATUSES, listApprovals } from "../approvals/list.ts";
import { fail, ok, type ToolResult } from "../tools/define.ts";
import type { AppDeps } from "./app.ts";

/**
 * The Approvals page. Reading the queue is public, like the rest of the
 * dashboard; deciding lives under /api/admin/*, behind the admin guard.
 */
const Query = z.object({ status: z.enum(APPROVAL_STATUSES).optional() });

export function approvalRoutes(deps: AppDeps) {
  const draftsDir = deps.draftsDir ?? DRAFTS_DIR;
  return new Hono().get("/", async (c) => {
    const q = Query.safeParse(c.req.query());
    if (!q.success) return c.json(fail("INVALID_QUERY", `status must be one of: ${APPROVAL_STATUSES.join(", ")}.`), 400);
    const approvals = (await listApprovals(deps.db, q.data.status)).map((a) => ({
      ...a,
      // "Rejections become new test cases": has `npm run eval:draft-from-rejections` written this one's draft yet?
      draftCase: a.status !== "rejected" || a.runId === null ? null : draftExists(draftsDir, a) ? "written" : "not_yet",
    }));
    return c.json(ok({ approvals }));
  });
}

const Id = z.coerce.number().int().positive();
const Body = z.object({ note: z.string().optional() });

const STATUS: Record<string, ContentfulStatusCode> = { NOT_FOUND: 404, ALREADY_DECIDED: 409, OVER_REFUNDABLE: 409 };

/** Mounted under /api/admin/approvals (see app.ts). */
export function approvalAdminRoutes(deps: AppDeps) {
  const decide = (fn: (ctx: DecisionContext, id: number, note?: string) => Promise<ToolResult>) =>
    async (c: Context) => {
      const id = Id.safeParse(c.req.param("id"));
      if (!id.success) return c.json(fail("NOT_FOUND", "No such approval."), 404);
      const body = Body.safeParse(await c.req.json().catch(() => ({})));
      if (!body.success) return c.json(fail("INVALID_BODY", "Send { note?: string }."), 400);
      const ctx: DecisionContext = { db: deps.db, storeNow: deps.clock(), decidedAt: deps.now(), decidedBy: "admin" };
      const result = await fn(ctx, id.data, body.data.note);
      return result.ok ? c.json(ok(result.data)) : c.json(result, STATUS[result.error.code] ?? 400);
    };
  return new Hono().post("/:id/approve", decide(approve)).post("/:id/reject", decide(reject));
}
