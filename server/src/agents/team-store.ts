import { asc, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { TEAM_ROLES, type TeamRole } from "../db/schema.ts";
import { fail, ok, type ToolResult } from "../tools/define.ts";
import type { Team, TeamSpec } from "./team.ts";

/**
 * The agent team in the database: an append-only history (`team_changes`),
 * from which the current team is derived. Nothing is ever updated or deleted,
 * so the dashboard can always show who changed what, when and why.
 *
 * Retiring (Julian, 2026-10-02) applies to a (role, model) combination, never
 * to a whole role, so every role always has a model. Retiring the role's
 * current model therefore needs a replacement in the same action. A retired
 * combination can't be switched to until it's reinstated, with its own reason.
 *
 * The rules are pure functions over the history (foldHistory, planChange);
 * the database part only reads, locks and appends.
 */

export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 500;

export type TeamChangeRow = typeof s.teamChanges.$inferSelect;
export type TeamState = { current: Record<TeamRole, string>; retired: Record<TeamRole, string[]> };

export type TeamChangeRequest =
  | { action: "switch"; role: TeamRole; model: string; reason: string }
  | { action: "retire"; role: TeamRole; model: string; replacement?: string | undefined; reason: string }
  | { action: "reinstate"; role: TeamRole; model: string; reason: string };

/** Replays the history in order. null if some role has no row yet (before the first read seeds it). */
export function foldHistory(rows: readonly Pick<TeamChangeRow, "role" | "action" | "model" | "toModel">[]): TeamState | null {
  const current: Partial<Record<TeamRole, string>> = {};
  const retired: Record<TeamRole, string[]> = { router: [], shopping: [], support: [] };
  for (const r of rows) {
    current[r.role] = r.toModel;
    if (r.action === "retire") retired[r.role] = [...retired[r.role].filter((m) => m !== r.model), r.model];
    if (r.action === "reinstate") retired[r.role] = retired[r.role].filter((m) => m !== r.model);
  }
  if (!TEAM_ROLES.every((role) => current[role])) return null;
  return { current: current as Record<TeamRole, string>, retired };
}

/**
 * Checks a change against the current state and says what row it appends.
 * `known` is every model config id (config/models.json).
 */
export function planChange(state: TeamState, req: TeamChangeRequest, known: readonly string[]): ToolResult<{ model: string; fromModel: string; toModel: string }> {
  const reason = req.reason.trim();
  if (reason.length < REASON_MIN_LENGTH) return fail("REASON_REQUIRED", `Give a reason of at least ${REASON_MIN_LENGTH} characters; it's kept in the team history.`);
  if (reason.length > REASON_MAX_LENGTH) return fail("REASON_TOO_LONG", `Keep the reason under ${REASON_MAX_LENGTH} characters.`);
  if (!known.includes(req.model)) return fail("UNKNOWN_MODEL", `No model config "${req.model}" in config/models.json.`);

  const current = state.current[req.role];
  const retired = state.retired[req.role];
  const isRetired = (m: string) => retired.includes(m);

  switch (req.action) {
    case "switch":
      if (req.model === current) return fail("ALREADY_CURRENT", `${req.role} already uses ${req.model}.`);
      if (isRetired(req.model)) return fail("RETIRED", `${req.model} is retired for ${req.role}. Reinstate it first (with a reason).`);
      return ok({ model: req.model, fromModel: current, toModel: req.model });

    case "retire": {
      if (isRetired(req.model)) return fail("ALREADY_RETIRED", `${req.model} is already retired for ${req.role}.`);
      if (req.model !== current) {
        if (req.replacement !== undefined) return fail("REPLACEMENT_NOT_NEEDED", `${req.model} isn't ${req.role}'s current model, so nothing replaces it.`);
        return ok({ model: req.model, fromModel: current, toModel: current });
      }
      // Retiring the current model: the role must keep a model.
      if (req.replacement === undefined) return fail("REPLACEMENT_REQUIRED", `${req.model} is ${req.role}'s current model. Choose the model that replaces it.`);
      if (!known.includes(req.replacement)) return fail("UNKNOWN_MODEL", `No model config "${req.replacement}" in config/models.json.`);
      if (req.replacement === req.model) return fail("REPLACEMENT_REQUIRED", "The replacement must be a different model.");
      if (isRetired(req.replacement)) return fail("RETIRED", `${req.replacement} is retired for ${req.role}. Reinstate it first.`);
      return ok({ model: req.model, fromModel: current, toModel: req.replacement });
    }

    case "reinstate":
      if (!isRetired(req.model)) return fail("NOT_RETIRED", `${req.model} isn't retired for ${req.role}.`);
      // Reinstating makes it selectable again; it doesn't switch to it.
      return ok({ model: req.model, fromModel: current, toModel: current });
  }
}

// ---------- Database ----------

// One lock for every write to the history, so two admins (or the first two
// readers seeding it) can't interleave: each change is checked against the
// state it's appended to.
const lockHistory = (tx: DbOrTx) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('team_changes'))`);

const readRows = (db: DbOrTx) => db.select().from(s.teamChanges).orderBy(asc(s.teamChanges.id));

/**
 * The team's history and current state. On first use (no row for a role) it
 * records an `initial` row from config/team.json, so the file is only a
 * starting point; after that, the database decides.
 */
export async function readTeam(db: DbOrTx, fileSpec: TeamSpec, at: Date): Promise<{ state: TeamState; history: TeamChangeRow[] }> {
  let rows = await readRows(db);
  let state = foldHistory(rows);
  if (!state) {
    rows = await db.transaction(async (tx) => {
      await lockHistory(tx);
      const fresh = await readRows(tx);
      const missing = TEAM_ROLES.filter((role) => !fresh.some((r) => r.role === role));
      if (missing.length) {
        await tx.insert(s.teamChanges).values(
          missing.map((role) => ({
            role,
            action: "initial" as const,
            model: fileSpec[role].model,
            fromModel: null,
            toModel: fileSpec[role].model,
            reason: "Starting team, from config/team.json.",
            decidedBy: "system",
            at,
          })),
        );
      }
      return readRows(tx);
    });
    state = foldHistory(rows)!;
  }
  return { state, history: rows };
}

export async function changeTeam(
  db: DbOrTx,
  req: TeamChangeRequest,
  ctx: {
    fileSpec: TeamSpec;
    known: readonly string[];
    at: Date;
    decidedBy: string;
    /** Can the team with this change actually be built (API key set...)? An error message, or null. Checked before anything is saved. */
    canBuild?: (spec: TeamSpec) => string | null;
  },
): Promise<ToolResult<TeamChangeRow>> {
  await readTeam(db, ctx.fileSpec, ctx.at); // seeds the initial rows if needed
  return db.transaction(async (tx) => {
    await lockHistory(tx);
    const state = foldHistory(await readRows(tx))!;
    const plan = planChange(state, req, ctx.known);
    if (!plan.ok) return plan;
    if (plan.data.toModel !== plan.data.fromModel && ctx.canBuild) {
      const spec = { ...specOf(state), [req.role]: { model: plan.data.toModel } };
      const problem = ctx.canBuild(spec);
      if (problem) return fail("MODEL_UNAVAILABLE", problem);
    }
    const [row] = await tx
      .insert(s.teamChanges)
      .values({ role: req.role, action: req.action, ...plan.data, reason: req.reason.trim(), decidedBy: ctx.decidedBy, at: ctx.at })
      .returning();
    return ok(row!);
  });
}

/**
 * The team spec for a new conversation: the database's current team, unless
 * MODEL is set in the environment, which still overrides every role (dev
 * convenience, unchanged from loadTeamSpec).
 */
export async function loadDbTeamSpec(db: DbOrTx, fileSpec: TeamSpec, at: Date, env: Record<string, string | undefined> = process.env): Promise<TeamSpec> {
  if (env.MODEL) return { router: { model: env.MODEL }, shopping: { model: env.MODEL }, support: { model: env.MODEL } };
  return specOf((await readTeam(db, fileSpec, at)).state);
}

const specOf = (state: TeamState): TeamSpec => ({
  router: { model: state.current.router },
  shopping: { model: state.current.shopping },
  support: { model: state.current.support },
});

/**
 * A team builder for the chat API: each new conversation reads the current
 * team from the database, so a switch on the Agents page applies to the next
 * conversation without a restart (open ones keep the team they started with).
 */
export function teamFromDb(
  db: DbOrTx,
  opts: { fileSpec: () => TeamSpec; build: (spec: TeamSpec) => Team; now: () => Date; env?: Record<string, string | undefined> },
): () => Promise<Team> {
  return async () => opts.build(await loadDbTeamSpec(db, opts.fileSpec(), opts.now(), opts.env ?? process.env));
}
