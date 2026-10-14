import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { changeTeam, getAgents, type AgentsView, type RoleView, type TeamRole } from "../lib/api.ts";
import {
  ROLE_LABEL,
  bestInRole,
  costWarning,
  describeChange,
  evalCell,
  evalRows,
  pct,
  retireTargets,
  splitModelId,
  switchTargets,
  tokens,
  usd,
  type EvalRow,
  type EvalStatus,
} from "./agents.ts";
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
          Eval results: the held-out test set, never tuned on; each run uses one model in all three roles.{" "}
          {data.eval?.sets.map((s) => `${s.id}: ${s.label}`).join("; ")}
          {(data.eval?.sets.length ?? 0) > 1 ? " (each model from the first run that has it)" : ""}. Chats: the test conversations in which the model played the role.
          Errored: the customer got the error message instead of an answer. Task success: the role's cases graded correct by the code checks and the judge; for the router,
          conversations sent to the right agent. Policy violations and more on the{" "}
          <a href="#/comparison" className="underline">
            Model comparison
          </a>{" "}
          page.
        </p>
      )}
    </div>
  );
}

const STATUS_TAG: Record<EvalStatus, { text: string; tone: string } | null> = {
  current: { text: "(current)", tone: "text-forest-700" },
  retired: { text: "(retired)", tone: "text-red-600" },
  former: { text: "(switched out)", tone: "text-stone-500" },
  other: null,
};

/**
 * The phone layout (mockup approved by Julian, 2026-10-14): models across,
 * measures down, so three models fit without sideways scrolling. Task success
 * comes first; the current model's column is shaded; the role's best score is green.
 */
function EvalTablePhone({ role, rows, best }: { role: TeamRole; rows: EvalRow[]; best: Set<string> }) {
  const shade = (status: EvalStatus) => (status === "current" ? "bg-forest-50" : "");
  const line = (label: string, cell: (row: EvalRow) => ReactNode) => (
    <tr className="border-t border-stone-100">
      <th scope="row" className="py-1.5 pr-1 text-left text-xs font-normal text-stone-500">
        {label}
      </th>
      {rows.map((row) => (
        <td key={row.model} className={`px-1 py-1.5 text-center ${shade(row.status)}`}>
          {row.figures ? cell(row) : "–"}
        </td>
      ))}
    </tr>
  );
  const group = (title: string) => (
    <tr>
      <th colSpan={rows.length + 1} scope="colgroup" className="pt-3 pb-1 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-700">
        {title}
      </th>
    </tr>
  );
  return (
    <table className="w-full table-fixed text-sm tabular-nums md:hidden">
      <colgroup>
        <col className="w-[30%]" />
        {rows.map((row) => (
          <col key={row.model} />
        ))}
      </colgroup>
      <thead>
        <tr className="border-b border-stone-200 align-bottom">
          <th className="pb-2 text-left text-xs font-normal text-stone-500">Model</th>
          {rows.map((row) => {
            const [provider, name] = splitModelId(row.model);
            const tag = STATUS_TAG[row.status];
            return (
              <th key={row.model} scope="col" className={`px-1 pb-2 text-center font-normal ${shade(row.status)}`}>
                <span className="block text-[11px] text-stone-500">{provider}</span>
                <span className="block text-xs font-semibold leading-tight [overflow-wrap:anywhere]">{name}</span>
                {tag && <span className={`text-[11px] ${tag.tone}`}>{tag.text}</span>}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row" className="py-2.5 pr-1 text-left text-xs font-semibold">
            {role === "router" ? "Routing accuracy" : "Task success"}
          </th>
          {rows.map((row) => {
            // evalCell's "80% (33/41)", split so the count sits under the percentage.
            const [score, count] = (row.success ?? "–").split(" ");
            return (
              <td key={row.model} className={`px-1 py-2.5 text-center ${shade(row.status)}`}>
                <span className={`block text-base font-semibold ${best.has(row.model) ? "text-forest-700" : ""}`}>{score}</span>
                {count && <span className="block text-[11px] text-stone-500">{count}</span>}
              </td>
            );
          })}
        </tr>
        {group("Outcomes")}
        {line("Chats", (x) => x.figures!.conversations)}
        {line("Resolved", (x) => x.figures!.outcomes.resolved)}
        {line("Approval", (x) => x.figures!.outcomes.approval_needed)}
        {line("Escalated", (x) => x.figures!.outcomes.escalated)}
        {line("Errored", (x) => (
          <>
            {x.figures!.outcomes.failed}
            <span className="block text-[11px] text-stone-500">{pct(x.figures!.failureRate)}</span>
          </>
        ))}
        {group("Usage")}
        {line("Tokens in", (x) => tokens(x.figures!.inputTokens))}
        {line("Tokens out", (x) => tokens(x.figures!.outputTokens))}
        {line("Cost", (x) => usd(x.figures!.costMicros))}
        {line("Eval run", (x) => <span className="text-xs text-stone-500">{x.set}</span>)}
      </tbody>
    </table>
  );
}

function RoleCard({ role: r, data, token, onChanged }: { role: RoleView; data: AgentsView; token: string | null; onChanged: () => Promise<void> }) {
  const rows = evalRows(r, data.eval);
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

      {/* Eval results, not live chats (Julian, 2026-10-06). */}
      <h3 className="mt-4 mb-1 text-sm font-semibold">Eval results</h3>
      {data.eval === null ? (
        <p className="text-sm text-stone-500">No comparison data yet (npm run eval:sets).</p>
      ) : (
        <>
          <EvalTablePhone role={r.role} rows={rows} best={bestInRole(data.eval, r.role, rows.map((x) => x.model))} />
          {/* The wide table needs ~40rem; below md it would scroll sideways, so phones get the transposed one above. */}
          <div className="-mx-4 hidden overflow-x-auto px-4 md:block">
            <table className="w-full min-w-[40rem] whitespace-nowrap text-left text-sm tabular-nums">
              <thead className="text-xs text-stone-500">
                <tr>
                  <th className="py-1 pr-3 font-normal">Model</th>
                  <th className="py-1 pr-3 text-center font-normal">Chats</th>
                  <th className="py-1 pr-3 text-center font-normal">Resolved</th>
                  <th className="py-1 pr-3 text-center font-normal">Approval</th>
                  <th className="py-1 pr-3 text-center font-normal">Escalated</th>
                  <th className="py-1 pr-3 font-normal">Errored</th>
                  <th className="py-1 pr-3 font-normal">Tokens in / out</th>
                  <th className="py-1 pr-3 font-normal">Cost</th>
                  <th className="whitespace-normal py-1 font-normal">{r.role === "router" ? "Routing accuracy" : "Task success"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ model, status, set, figures: f, success }) => (
                  <tr key={model} className="border-t border-stone-100">
                    <td className="py-1 pr-3">
                      {model}
                      {STATUS_TAG[status] && <span className={`ml-1 text-xs ${STATUS_TAG[status]!.tone}`}>{STATUS_TAG[status]!.text}</span>}
                    </td>
                    <td className="py-1 pr-3 text-center">{f ? f.conversations : "–"}</td>
                    <td className="py-1 pr-3 text-center">{f ? f.outcomes.resolved : "–"}</td>
                    <td className="py-1 pr-3 text-center">{f ? f.outcomes.approval_needed : "–"}</td>
                    <td className="py-1 pr-3 text-center">{f ? f.outcomes.escalated : "–"}</td>
                    <td className="py-1 pr-3">{f ? `${f.outcomes.failed} (${pct(f.failureRate)})` : "–"}</td>
                    <td className="py-1 pr-3">{f ? `${tokens(f.inputTokens)} / ${tokens(f.outputTokens)}` : "–"}</td>
                    <td className="py-1 pr-3">{f ? usd(f.costMicros) : "–"}</td>
                    <td className="whitespace-normal py-1">
                      {success ?? "–"}
                      {set && <span className="ml-1 text-xs text-stone-500">{set}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Always open (Julian, 2026-10-06). */}
      <h3 className="mt-4 mb-1 text-sm font-semibold">History</h3>
      <ol className="space-y-2 text-sm">
        {r.history.map((h) => (
          <li key={h.id}>
            <p>{describeChange(h)}</p>
            <p className="text-xs text-stone-500">
              {when(h.at)} · {h.decidedBy} · “{h.reason}”
            </p>
          </li>
        ))}
      </ol>

      {token && <ChangeForm role={r} data={data} token={token} onChanged={onChanged} />}
    </section>
  );
}

function ChangeForm({ role: r, data, token, onChanged }: { role: RoleView; data: AgentsView; token: string; onChanged: () => Promise<void> }) {
  const { models, reasonMinLength: minReason } = data;
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
      {becomes && (
        <div className="rounded bg-stone-50 p-2">
          <p className="text-xs text-stone-500">Eval for {becomes} in this role:</p>
          <p className="text-sm">{evalCell(data.eval, r.role, becomes) ?? "not evaluated"}</p>
        </div>
      )}
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
