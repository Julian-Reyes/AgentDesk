import { useCallback, useEffect, useState } from "react";
import { decideApproval, getApprovals, type Approval } from "../lib/api.ts";
import { DRAFT_LABEL, noteProblem, requestSummary, shortRun, when } from "./approvals.ts";

/** Pending requests (oldest first) with approve / reject, then the decided history. */
export function ApprovalsPage({ token }: { token: string | null }) {
  const [pending, setPending] = useState<Approval[] | null>(null);
  const [decided, setDecided] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, a, r] = await Promise.all([getApprovals("pending"), getApprovals("approved"), getApprovals("rejected")]);
      setPending(p);
      setDecided([...a, ...r].sort((x, y) => (y.decidedAt ?? "").localeCompare(x.decidedAt ?? "")));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="pending-h">
        <div className="mb-3 flex items-baseline justify-between">
          <h1 id="pending-h" className="text-xl font-semibold">
            Waiting for a decision {pending && <span className="text-stone-500">({pending.length})</span>}
          </h1>
          <button type="button" onClick={() => void load()} className="text-sm text-forest-700 underline">
            Refresh
          </button>
        </div>
        {error && <p className="mb-3 rounded-md bg-rust-50 p-3 text-sm text-rust-600">{error}</p>}
        {!pending && !error && <p className="text-stone-500">Loading…</p>}
        {pending?.length === 0 && <p className="text-stone-500">Nothing waiting. Refunds over $50 and goodwill over the limits land here.</p>}
        <ul className="space-y-3">
          {pending?.map((a) => (
            <PendingCard key={a.id} approval={a} token={token} onDecided={load} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="decided-h">
        <h2 id="decided-h" className="mb-3 text-lg font-semibold">
          Decided
        </h2>
        {decided.length === 0 ? (
          <p className="text-sm text-stone-500">No decisions yet.</p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white text-sm">
            {decided.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p>
                    <StatusBadge status={a.status} /> <span className="font-medium">{requestSummary(a)}</span> · {a.customer.name}
                    {a.orderNumber !== null && ` · #${a.orderNumber}`}
                  </p>
                  {a.decisionNote && <p className="text-stone-600">“{a.decisionNote}”</p>}
                  {a.draftCase && <p className="text-xs text-stone-500">{DRAFT_LABEL[a.draftCase]}</p>}
                </div>
                <p className="shrink-0 text-xs text-stone-500">
                  {a.decidedBy} · {a.decidedAt && when(a.decidedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: Approval["status"] }) {
  const tone = status === "approved" ? "bg-forest-50 text-forest-800" : "bg-rust-50 text-rust-600";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{status === "approved" ? "Approved" : "Rejected"}</span>;
}

function PendingCard({ approval: a, token, onDecided }: { approval: Approval; token: string | null; onDecided: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (action: "approve" | "reject") => {
    const problem = noteProblem(action, note);
    if (problem) return setError(problem);
    if (!token) return setError("Paste the admin token above first.");
    setBusy(true);
    setError(null);
    try {
      await decideApproval(a.id, action, note, token);
      await onDecided();
    } catch (e) {
      // e.g. OVER_REFUNDABLE: the server's re-check found it no longer fits what was paid.
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <li className="rounded-md border border-stone-200 bg-white p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="font-semibold">{requestSummary(a)}</p>
        <p className="text-xs text-stone-500">
          #{a.id} · requested {when(a.createdAt)}
        </p>
      </div>
      <p className="text-sm text-stone-700">
        {a.customer.name}
        {a.orderNumber !== null && ` · order #${a.orderNumber}`}
        {a.runId && (
          <>
            {" · "}
            <a href={`#/runs/${a.runId}`} className="text-forest-700 underline">
              conversation {shortRun(a.runId)}
            </a>
          </>
        )}
      </p>
      <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-stone-500">Queued because</dt>
        <dd>{a.queuedBecause}</dd>
        {a.agentNote && (
          <>
            <dt className="text-stone-500">Agent's note</dt>
            <dd>{a.agentNote}</dd>
          </>
        )}
      </dl>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <label className="sr-only" htmlFor={`note-${a.id}`}>
          Note for approval #{a.id}
        </label>
        <textarea
          id={`note-${a.id}`}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (required to reject)"
          className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
        />
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void decide("approve")} className="rounded bg-forest-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            Approve
          </button>
          <button type="button" disabled={busy} onClick={() => void decide("reject")} className="rounded border border-rust-600 px-3 py-1.5 text-sm text-rust-600 disabled:opacity-50">
            Reject
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rust-600">
          {error}
        </p>
      )}
    </li>
  );
}
