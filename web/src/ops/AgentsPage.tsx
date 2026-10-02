import { useCallback, useEffect, useState, type FormEvent } from "react";
import { changeTeam, getAgents, type AgentsView, type ModelOption, type RoleView } from "../lib/api.ts";
import { ROLE_LABEL, costWarning, describeChange, liveRows, ms, pct, retireTargets, switchTargets, tokens, usd } from "./agents.ts";
import { when } from "./approvals.ts";

/** One card per role: current model, prompt version, live numbers, history, and (with the token) switch / retire / reinstate. */
export function AgentsPage({ token }: { token: string | null }) {
  const [data, setData] = useState<AgentsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getAgents());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Agents</h1>
      {error && <p className="rounded-md bg-rust-50 p-3 text-sm text-rust-600">{error}</p>}
      {!data && !error && <p className="text-stone-500">Loading…</p>}
      {data?.envOverride && (
        <p role="status" className="rounded-md bg-rust-50 p-3 text-sm text-rust-600">
          MODEL={data.envOverride} is set in this server's .env, so every chat uses that model whatever the team below says.
        </p>
      )}
      {data?.roles.map((r) => (
        <RoleCard key={r.role} role={r} data={data} token={token} onChanged={load} />
      ))}
      {data && (
        <p className="text-xs text-stone-500">
          Live numbers: demo and CLI conversations in the last {data.liveWindowDays} days, from the traces (evals excluded). Latency is per model call. Eval results per model arrive with the comparison page.
        </p>
      )}
    </div>
  );
}

function RoleCard({ role: r, data, token, onChanged }: { role: RoleView; data: AgentsView; token: string | null; onChanged: () => Promise<void> }) {
  const rows = liveRows(r);
  return (
    <section aria-labelledby={`role-${r.role}`} className="rounded-md border border-stone-200 bg-white p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id={`role-${r.role}`} className="text-lg font-semibold">
          {ROLE_LABEL[r.role]}
        </h2>
        <p className="text-xs text-stone-500">prompt {r.prompt}</p>
      </div>
      <p className="text-sm">
        <span className="font-medium">{r.model}</span>
        {r.since && <span className="text-stone-500"> · since {when(r.since)}</span>}
      </p>
      {r.retired.length > 0 && <p className="text-xs text-stone-500">Retired here: {r.retired.join(", ")}</p>}

      <h3 className="mt-4 mb-1 text-sm font-semibold">Live, last {data.liveWindowDays} days</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">No live conversations in this window.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th className="py-1 pr-3 font-normal">Model</th>
                <th className="py-1 pr-3 font-normal">Chats</th>
                <th className="py-1 pr-3 font-normal">Resolved / approval / escalated / failed</th>
                <th className="py-1 pr-3 font-normal">Failure</th>
                <th className="py-1 pr-3 font-normal">p50 / p95</th>
                <th className="py-1 pr-3 font-normal">Tokens in / out</th>
                <th className="py-1 font-normal">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.model} className="border-t border-stone-100">
                  <td className="py-1 pr-3">
                    {l.model}
                    {l.model === r.model && <span className="ml-1 text-xs text-forest-700">(current)</span>}
                  </td>
                  <td className="py-1 pr-3">{l.conversations}</td>
                  <td className="py-1 pr-3">
                    {l.outcomes.resolved} / {l.outcomes.approval_needed} / {l.outcomes.escalated} / {l.outcomes.failed}
                  </td>
                  <td className="py-1 pr-3">{pct(l.failureRate)}</td>
                  <td className="py-1 pr-3">
                    {ms(l.latencyMs.p50)} / {ms(l.latencyMs.p95)}
                  </td>
                  <td className="py-1 pr-3">
                    {tokens(l.inputTokens)} / {tokens(l.outputTokens)}
                  </td>
                  <td className="py-1">{usd(l.costMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold">History ({r.history.length})</summary>
        <ol className="mt-2 space-y-2 text-sm">
          {r.history.map((h) => (
            <li key={h.id}>
              <p>{describeChange(h)}</p>
              <p className="text-xs text-stone-500">
                {when(h.at)} · {h.decidedBy} · “{h.reason}”
              </p>
            </li>
          ))}
        </ol>
      </details>

      {token && <ChangeForm role={r} models={data.models} minReason={data.reasonMinLength} token={token} onChanged={onChanged} />}
    </section>
  );
}

function ChangeForm({ role: r, models, minReason, token, onChanged }: { role: RoleView; models: ModelOption[]; minReason: number; token: string; onChanged: () => Promise<void> }) {
  const [action, setAction] = useState<"switch" | "retire" | "reinstate">("switch");
  const [model, setModel] = useState("");
  const [replacement, setReplacement] = useState("");
  const [reason, setReason] = useState("");
  const [paidOk, setPaidOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = action === "switch" ? switchTargets(r, models) : action === "retire" ? retireTargets(r, models) : models.filter((m) => r.retired.includes(m.id));
  const needsReplacement = action === "retire" && model === r.model;
  // The model that becomes current, if any: that's what costs money.
  const becomes = action === "switch" ? model : needsReplacement ? replacement : "";
  const warning = costWarning(models.find((m) => m.id === becomes));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await changeTeam(r.role, action, { model, reason, ...(needsReplacement ? { replacement } : {}) }, token);
      setModel("");
      setReplacement("");
      setReason("");
      setPaidOk(false);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const id = (k: string) => `${r.role}-${k}`;
  return (
    <form onSubmit={submit} className="mt-4 space-y-2 border-t border-stone-200 pt-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={id("action")}>
          Action
        </label>
        <select
          id={id("action")}
          value={action}
          onChange={(e) => {
            setAction(e.target.value as typeof action);
            setModel("");
            setReplacement("");
          }}
          className="rounded border border-stone-300 px-2 py-1"
        >
          <option value="switch">Switch to</option>
          <option value="retire">Retire</option>
          <option value="reinstate">Reinstate</option>
        </select>
        <label className="sr-only" htmlFor={id("model")}>
          Model
        </label>
        <select id={id("model")} value={model} onChange={(e) => setModel(e.target.value)} className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1">
          <option value="">{targets.length ? "Choose a model…" : "Nothing to choose"}</option>
          {targets.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
              {m.paid ? " (paid)" : ""}
            </option>
          ))}
        </select>
      </div>
      {needsReplacement && (
        <div>
          <label htmlFor={id("replacement")} className="mb-1 block text-stone-600">
            {r.model} is the current model. Replace it with:
          </label>
          <select id={id("replacement")} value={replacement} onChange={(e) => setReplacement(e.target.value)} className="w-full rounded border border-stone-300 px-2 py-1">
            <option value="">Choose a model…</option>
            {switchTargets(r, models).map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
                {m.paid ? " (paid)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      <label htmlFor={id("reason")} className="block text-stone-600">
        Reason (kept in the history, at least {minReason} characters)
      </label>
      <textarea id={id("reason")} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded border border-stone-300 px-2 py-1" />
      {warning && (
        <label className="flex gap-2 rounded bg-rust-50 p-2 text-rust-600">
          <input type="checkbox" checked={paidOk} onChange={(e) => setPaidOk(e.target.checked)} />
          <span>{warning} I understand.</span>
        </label>
      )}
      <button
        type="submit"
        disabled={busy || !model || (needsReplacement && !replacement) || reason.trim().length < minReason || (!!warning && !paidOk)}
        className="rounded bg-forest-700 px-3 py-1.5 text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save change"}
      </button>
      {error && (
        <p role="alert" className="text-rust-600">
          {error}
        </p>
      )}
    </form>
  );
}
