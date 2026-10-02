import type { Approval } from "../lib/api.ts";

/**
 * The Approvals page's display logic, as plain functions so it's tested in
 * Node (no component-test libraries). The server decides everything; these
 * only describe it.
 */

/** Integer cents → "$179.99". */
export const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One line saying what's being asked: "$179.99 refund, damaged: Harbor 3°C Double Sleeping Bag" or "20% goodwill coupon". */
export function requestSummary(a: Pick<Approval, "kind" | "amountCents" | "percent" | "item" | "refundReason">): string {
  if (a.kind === "refund") {
    const amount = a.amountCents === null ? "Refund" : `${dollars(a.amountCents)} refund`;
    const reason = a.refundReason ? `, ${a.refundReason}` : "";
    return `${amount}${reason}${a.item ? `: ${a.item}` : ""}`;
  }
  return `${a.percent ?? "?"}% goodwill coupon`;
}

/** The server's rule (approvals/decide.ts): a rejection needs at least 3 characters of note. Checked here only to explain it before sending. */
export const NOTE_MIN_LENGTH = 3;
export function noteProblem(action: "approve" | "reject", note: string): string | null {
  if (action === "reject" && note.trim().length < NOTE_MIN_LENGTH) return "Say why you're rejecting it. The note becomes the reason in a draft eval case.";
  if (note.length > 1000) return "Keep the note under 1,000 characters.";
  return null;
}

/** "2026-10-02 15:30 UTC": approvals are timestamped in UTC on the server. */
export const when = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export const DRAFT_LABEL: Record<NonNullable<Approval["draftCase"]>, string> = {
  written: "Draft case: written",
  not_yet: "Draft case: not yet (run npm run eval:draft-from-rejections)",
};

/** A short, stable run reference for links: the first 8 characters of the id. */
export const shortRun = (runId: string) => runId.slice(0, 8);
