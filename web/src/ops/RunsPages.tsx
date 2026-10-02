import { useEffect, useState, type ReactNode } from "react";
import {
  getEvalConversation,
  getEvalConversations,
  getEvalRuns,
  getLiveRun,
  getLiveRuns,
  type EvalConversation,
  type EvalConversationRow,
  type EvalRunInfo,
  type LiveRun,
  type TraceStep,
} from "../lib/api.ts";
import { when } from "./approvals.ts";
import { href } from "./route.ts";
import { Timeline } from "./Timeline.tsx";

/**
 * The Runs pages: live traces from the database, and saved eval runs from
 * their files, both shown with the same step timeline.
 */

function useLoad<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ data: null, error: null });
    load().then(
      (data) => live && setState({ data, error: null }),
      (e: Error) => live && setState({ data: null, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, deps);
  return state;
}

export function RunsTabs({ active }: { active: "live" | "eval" }) {
  const tab = (key: "live" | "eval", label: string, to: string) => (
    <a href={to} aria-current={active === key ? "page" : undefined} className={`rounded-full px-3 py-1 text-sm ${active === key ? "bg-forest-700 text-white" : "border border-stone-300 bg-white text-stone-700"}`}>
      {label}
    </a>
  );
  return (
    <div className="mb-4 flex items-center gap-2">
      <h1 className="mr-2 text-xl font-semibold">Runs</h1>
      {tab("live", "Live", "#/runs")}
      {tab("eval", "Eval", "#/evals")}
    </div>
  );
}

const OUTCOME_TONE: Record<string, string> = { resolved: "text-forest-700", approval_needed: "text-stone-700", escalated: "text-amber-700", failed: "text-rust-600" };
const models = (team: LiveRun["team"]) => [...new Set(Object.values(team).map((m) => m?.model).filter(Boolean))].join(", ");

// ---------- Live ----------

export function LiveRunsPage() {
  // Real conversations by default; the eval runner's own traces are under "Eval runner" (and, graded, in the Eval tab).
  const [source, setSource] = useState("demo,cli");
  const [outcome, setOutcome] = useState("");
  const [runs, setRuns] = useState<LiveRun[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (before?: string) => {
    setLoading(true);
    try {
      const page = await getLiveRuns({ source, outcome, ...(before ? { before } : {}) });
      setRuns((r) => (before ? [...r, ...page.runs] : page.runs));
      setNext(page.next);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [source, outcome]);

  return (
    <div>
      <RunsTabs active="live" />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Select label="Source" value={source} onChange={setSource} options={[["demo,cli", "Demo + CLI"], ["demo", "Demo widget"], ["cli", "CLI"], ["eval", "Eval runner"], ["", "All sources"]]} />
        <Select label="Outcome" value={outcome} onChange={setOutcome} options={[["", "Any outcome"], ["resolved", "Resolved"], ["approval_needed", "Approval needed"], ["escalated", "Escalated"], ["failed", "Failed"]]} />
      </div>
      {error && <p className="mb-3 rounded-md bg-rust-50 p-3 text-sm text-rust-600">{error}</p>}
      <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white text-sm">
        {runs.map((r) => (
          <li key={r.id}>
            <a href={href.run(r.id)} className="block p-3 hover:bg-stone-50">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className={`font-medium ${OUTCOME_TONE[r.outcome ?? ""] ?? "text-stone-500"}`}>{r.outcome ?? "unfinished"}</span>
                <span className="text-stone-500">
                  {r.source}
                  {typeof r.labels.persona === "string" ? ` · ${r.labels.persona}` : ""}
                  {typeof r.labels.case === "string" ? ` · ${r.labels.case}` : ""} · {r.turns} turn{r.turns === 1 ? "" : "s"} · {models(r.team)}
                </span>
                <span className="ml-auto text-xs text-stone-500">{when(r.startedAt)}</span>
              </p>
              {r.firstMessage && <p className="mt-1 truncate text-stone-700">“{r.firstMessage}”</p>}
            </a>
          </li>
        ))}
        {!loading && runs.length === 0 && !error && <li className="p-3 text-stone-500">No runs match.</li>}
      </ul>
      {next && (
        <button type="button" disabled={loading} onClick={() => void load(next)} className="mt-3 rounded border border-stone-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50">
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

export function LiveRunPage({ id }: { id: string }) {
  const { data, error } = useLoad(() => getLiveRun(id), [id]);
  return (
    <div>
      <RunsTabs active="live" />
      {error && <p className="rounded-md bg-rust-50 p-3 text-sm text-rust-600">{error}</p>}
      {!data && !error && <p className="text-stone-500">Loading…</p>}
      {data && (
        <>
          <Facts
            rows={[
              ["Conversation", data.run.id],
              ["Outcome", data.run.outcome ?? "unfinished"],
              ["Source", `${data.run.source}${Object.keys(data.run.labels).length ? ` (${Object.entries(data.run.labels).map(([k, v]) => `${k}: ${String(v)}`).join(", ")})` : ""}`],
              ["Started", when(data.run.startedAt)],
              ["Team", Object.entries(data.run.team).map(([role, m]) => `${role}: ${m?.model ?? "?"}`).join(" · ")],
              ["Tokens / cost", `${data.run.inputTokens} in / ${data.run.outputTokens} out · $${(data.run.costMicros / 1e6).toFixed(4)}`],
            ]}
          />
          <Timeline steps={data.steps} />
        </>
      )}
    </div>
  );
}

// ---------- Eval ----------

export function EvalRunsPage() {
  const { data, error } = useLoad(getEvalRuns, []);
  return (
    <div>
      <RunsTabs active="eval" />
      {error && <p className="rounded-md bg-rust-50 p-3 text-sm text-rust-600">{error}</p>}
      {!data && !error && <p className="text-stone-500">Loading…</p>}
      {data && (
        <>
          <p className="mb-3 text-xs text-stone-500">
            Saved eval runs, graded with the current grader and judged by {data.judge.model} ({data.judge.rubric}), as in their reports.
          </p>
          <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white text-sm">
            {data.runs.map((r: EvalRunInfo) => (
              <li key={r.name}>
                <a href={href.evalRun(r.name)} className="block p-3 hover:bg-stone-50">
                  <span className="font-medium">{r.name}</span>{" "}
                  <span className="text-stone-500">
                    · {r.split} set · prompts {r.promptSet ?? "round-0"} · {r.cases} cases × {r.models.length} model{r.models.length === 1 ? "" : "s"}
                  </span>
                  <span className="block text-xs text-stone-500">{r.models.join(", ")}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = { pass: "text-forest-700", fail: "text-rust-600", script_mismatch: "text-amber-700" };

export function EvalRunPage({ run }: { run: string }) {
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const { data, error } = useLoad(() => getEvalConversations(run), [run]);
  const rows = (data?.conversations ?? []).filter((c: EvalConversationRow) => (!model || c.model === model) && (!status || c.status === status));
  return (
    <div>
      <RunsTabs active="eval" />
      <h2 className="mb-2 text-lg font-semibold">{run}</h2>
      {error && <p className="rounded-md bg-rust-50 p-3 text-sm text-rust-600">{error}</p>}
      {!data && !error && <p className="text-stone-500">Grading…</p>}
      {data && (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <Select label="Model" value={model} onChange={setModel} options={[["", "All models"], ...data.models.map((m): [string, string] => [m, m])]} />
            <Select label="Status" value={status} onChange={setStatus} options={[["", "Any status"], ["pass", "Pass"], ["fail", "Fail"], ["script_mismatch", "Script mismatch"], ["judge_failed", "Judge failed"], ["judge_pending", "Judge pending"], ["provider_error", "Provider error"]]} />
            <span className="self-center text-stone-500">{rows.length} conversations</span>
          </div>
          <ul className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white text-sm">
            {rows.map((c) => (
              <li key={`${c.model}/${c.caseId}`}>
                <a href={href.evalConversation(run, c.model, c.caseId)} className="block p-3 hover:bg-stone-50">
                  <span className={`font-medium ${STATUS_TONE[c.status] ?? "text-stone-600"}`}>{c.status.replace("_", " ")}</span> <span className="font-medium">{c.caseId}</span>{" "}
                  <span className="text-stone-500">· {c.model}</span>
                  {(c.failedChecks.length > 0 || c.judgeNo.length > 0) && (
                    <span className="block text-xs text-stone-600">
                      {[...c.failedChecks.map((k) => `${k.id} (${k.severity})`), ...c.judgeNo.map((j) => `${j} (judge: no)`)].join(", ")}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const SEVERITY_TONE = { policy: "bg-rust-50 text-rust-600", grounding: "bg-amber-50 text-amber-800", task: "bg-stone-100 text-stone-700" } as const;

export function EvalConversationPage({ run, model, caseId }: { run: string; model: string; caseId: string }) {
  const { data, error } = useLoad(() => getEvalConversation(run, model, caseId), [run, model, caseId]);
  return (
    <div>
      <RunsTabs active="eval" />
      <a href={href.evalRun(run)} className="text-sm text-forest-700 underline">
        ← {run}
      </a>
      {error && <p className="mt-3 rounded-md bg-rust-50 p-3 text-sm text-rust-600">{error}</p>}
      {!data && !error && <p className="mt-3 text-stone-500">Loading…</p>}
      {data && <EvalConversationView c={data} />}
    </div>
  );
}

function EvalConversationView({ c }: { c: EvalConversation }) {
  const answers = [...(c.verdict?.output?.checks ?? []), ...(c.verdict?.output?.scriptFit ?? [])];
  const question = (id: string) => {
    const q = c.grade.judgeQuestions.find((x) => x.id === id);
    return q ? (q.kind === "judge_check" ? q.statement : `Turn ${q.turn}: does the previous reply fit "${q.assumes}"?`) : id;
  };
  return (
    <div className="mt-3 space-y-5">
      <Facts
        rows={[
          ["Case", `${c.case.id} (${c.case.type}, ${c.case.split} set)`],
          ["Model", c.model],
          ["Final status", c.status.replace("_", " ")],
          ["Outcome", c.outcome],
          ["Judge", `${c.judge.model}, ${c.judge.rubric}`],
          ...(c.providerError ? ([["Provider error", c.providerError]] as [string, string][]) : []),
        ]}
      />
      <Section title="What the case expects">
        <p className="text-sm whitespace-pre-wrap">{c.case.why}</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-stone-500">Full case</summary>
          <pre className="mt-1 max-h-96 overflow-auto rounded bg-stone-100 p-2 text-xs">{JSON.stringify(c.case, null, 2)}</pre>
        </details>
      </Section>
      <Section title={`Checks (${c.grade.checks.filter((k) => !k.pass).length} failed of ${c.grade.checks.length})`}>
        <ul className="space-y-1 text-sm">
          {c.grade.checks.map((k) => (
            <li key={k.id} className="flex flex-wrap items-baseline gap-2">
              <span className={k.pass ? "text-forest-700" : "font-semibold text-rust-600"}>{k.pass ? "✓" : "✗"}</span>
              <span className={`rounded px-1.5 text-xs ${SEVERITY_TONE[k.severity]}`}>{k.severity}</span>
              <span>{k.label}</span>
              {k.detail && <span className="text-xs text-stone-500">{k.detail}</span>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Judge">
        {!c.verdict && <p className="text-sm text-stone-500">No verdict from this judge for this conversation.</p>}
        {c.verdict && !c.verdict.ok && <p className="text-sm text-rust-600">The judge failed: {c.verdict.error}</p>}
        {answers.length > 0 && (
          <ul className="space-y-2 text-sm">
            {answers.map((a) => (
              <li key={a.id}>
                <p>
                  <span className={a.answer ? "text-forest-700" : "font-semibold text-rust-600"}>{a.answer ? "yes" : "no"}</span> · {question(a.id)}
                  {a.votes && <span className="text-xs text-stone-500"> (votes {a.votes.map((v) => (v ? "yes" : "no")).join(", ")})</span>}
                </p>
                <p className="text-xs text-stone-600">{a.why}</p>
                {a.contradictions?.length ? <p className="text-xs font-medium text-amber-800">a vote's reason concluded the opposite of its answer</p> : null}
              </li>
            ))}
          </ul>
        )}
        {c.verdict?.output?.replies.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {c.verdict.output.replies.map((r) => (
              <li key={r.reply}>
                Reply {r.reply}: tone {r.tone}, clarity {r.clarity}, helpfulness {r.helpfulness} <span className="text-xs text-stone-600">· {r.why}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
      <Section title="Trace">
        <Timeline steps={c.steps as TraceStep[]} />
      </Section>
    </div>
  );
}

// ---------- Small parts ----------

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mb-4 grid gap-x-4 gap-y-1 rounded-md border border-stone-200 bg-white p-3 text-sm sm:grid-cols-[9rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-3">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center gap-1">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-stone-300 bg-white px-2 py-1">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
