import { isDeepStrictEqual } from "node:util";
import type { EvalCase } from "../case-schema.ts";
import type { RunStore } from "./store.ts";

/**
 * What the conversation or the judge depended on. A change to any of these
 * means the saved conversation no longer answers the revised case: the script
 * or customer was different, or the judge was asked other questions (or given
 * another note on a good answer). Those need a new run or a re-judge instead.
 *
 * Judge checks are the one exception, with allowJudgeChecks: they're part of
 * the verdict's question set (questionSetOf), so the old verdict stops counting
 * on its own and the conversation shows up as unjudged for eval:judge. A changed
 * judge note isn't in the question set, so an old verdict would silently keep
 * counting; that stays refused.
 */
const FIXED_FIELDS = ["customer", "turns", "judgeChecks", "judge"] as const;

/** needsRejudge: the judge checks changed, so this conversation's verdict no longer applies. */
export type CaseSnapshotChange = { model: string; caseId: string; fields: string[]; needsRejudge?: boolean };
export type CaseSnapshotPlan = { changes: CaseSnapshotChange[]; refused: (CaseSnapshotChange & { why: string })[] };

const fieldsOf = (c: EvalCase) => ({
  customer: c.customer,
  turns: c.turns,
  judgeChecks: c.expect.judgeChecks,
  judge: c.expect.judge,
});

/** Top-level case and `expect` fields that differ, e.g. ["why", "expect.effects"]. */
function changedFields(a: EvalCase, b: EvalCase): string[] {
  const out: string[] = [];
  const keys = (x: object, y: object) => [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
  for (const k of keys(a, b)) {
    if (k === "expect") continue;
    if (!isDeepStrictEqual((a as any)[k], (b as any)[k])) out.push(k);
  }
  for (const k of keys(a.expect, b.expect)) if (!isDeepStrictEqual((a.expect as any)[k], (b.expect as any)[k])) out.push(`expect.${k}`);
  return out;
}

/**
 * Which saved conversations would get the current definition of their case.
 * Grading is pure code over the saved observation and the case snapshot, so
 * after an approved change to a case's expectations (e.g. what money effects
 * are allowed), the saved run can be re-graded without new agent calls. Judge
 * verdicts stay valid because the questions and the note the judge saw are
 * unchanged (anything else is refused).
 */
export function planCaseSnapshotUpdate(store: RunStore, current: EvalCase[], opts: { allowJudgeChecks?: boolean } = {}): CaseSnapshotPlan {
  const byId = new Map(current.map((c) => [c.id, c]));
  const plan: CaseSnapshotPlan = { changes: [], refused: [] };
  for (const r of store.conversations()) {
    const now = byId.get(r.caseId);
    if (!now || isDeepStrictEqual(r.case, now)) continue;
    const change = { model: r.agentModel, caseId: r.caseId, fields: changedFields(r.case, now) };
    const before = fieldsOf(r.case);
    const after = fieldsOf(now);
    const fixed = FIXED_FIELDS.filter((f) => !isDeepStrictEqual(before[f], after[f]));
    const blocking = opts.allowJudgeChecks ? fixed.filter((f) => f !== "judgeChecks") : fixed;
    if (blocking.length) plan.refused.push({ ...change, why: `${blocking.join(", ")} changed: this needs a new run or a re-judge` });
    else plan.changes.push(fixed.includes("judgeChecks") ? { ...change, needsRejudge: true } : change);
  }
  return plan;
}

/**
 * Applies a plan: each conversation gets its current case, the old snapshot is
 * kept in caseHistory, and the manifest records the update and its reason.
 * Refuses to apply anything if any change was refused.
 */
export function applyCaseSnapshotUpdate(store: RunStore, current: EvalCase[], reason: string, at: string, opts: { allowJudgeChecks?: boolean } = {}): CaseSnapshotPlan {
  const plan = planCaseSnapshotUpdate(store, current, opts);
  if (plan.refused.length) throw new Error(`Refusing to update case snapshots: ${plan.refused.map((x) => `${x.model} ${x.caseId} (${x.why})`).join("; ")}`);
  if (!plan.changes.length) return plan;
  const byId = new Map(current.map((c) => [c.id, c]));
  const changing = new Set(plan.changes.map((c) => `${c.model}\n${c.caseId}`));
  for (const r of store.conversations()) {
    if (!changing.has(`${r.agentModel}\n${r.caseId}`)) continue;
    store.saveConversation({ ...r, case: byId.get(r.caseId)!, caseHistory: [...(r.caseHistory ?? []), { case: r.case, replacedAt: at, reason }] });
  }
  const m = store.manifest()!;
  const caseIds = [...new Set(plan.changes.map((c) => c.caseId))].sort();
  store.saveManifest({ ...m, caseUpdates: [...(m.caseUpdates ?? []), { at, reason, caseIds }] });
  return plan;
}
