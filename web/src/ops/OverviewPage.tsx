import { useEffect, useState, type ReactNode } from "react";
import { getAgents, getComparisonList, getComparisonSet, getOverview, type AgentsView, type ComparisonSet, type Finding, type SafetyFact } from "../lib/api.ts";
import { ROLE_LABEL } from "./agents.ts";
import { ciBar, ciText, winnerText } from "./comparison.ts";
import { SPLIT_LABEL, devGap, kpiTiles, latestDecision, shortModel, teamModel } from "./overview.ts";
import { IS_STATIC, SITE_ROOT } from "../lib/static.ts";
import { href } from "./route.ts";

/**
 * Where /ops opens: what the system is, how well it did and where to look
 * next. Numbers come from the default comparison set (the held-out test set
 * once it exists) and the team history; the examples and findings are
 * curated on the server, which only sends examples whose linked
 * conversation passed.
 */
export function OverviewPage() {
  const [set, setSet] = useState<ComparisonSet | null>(null);
  const [dev, setDev] = useState<ComparisonSet | null>(null);
  const [agents, setAgents] = useState<AgentsView | null>(null);
  const [curated, setCurated] = useState<{ safety: SafetyFact[]; findings: Finding[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fail = (e: Error) => setError(e.message);
    getComparisonList().then((list) => {
      if (list.default) getComparisonSet(list.default).then(setSet, fail);
      const devId = list.sets.find((s) => s.split === "dev" && s.generated && s.id !== list.default)?.id;
      if (devId) getComparisonSet(devId).then(setDev, fail);
    }, fail);
    getAgents().then(setAgents, fail);
    getOverview().then(setCurated, fail);
  }, []);

  if (error) return <p className="rounded-md bg-rust-50 p-3 text-sm text-rust-600">{error}</p>;
  if (!set || !agents || !curated) return <p className="text-stone-500">Loading…</p>;

  const team = teamModel(agents.roles);
  const tiles = kpiTiles(set, team);
  const decision = latestDecision(agents.roles, set);
  const gap = devGap(set, dev);

  return (
    <div className="space-y-10">
      <section aria-labelledby="overview-headline" className="space-y-3">
        <p className="text-xs font-semibold tracking-widest text-forest-600 uppercase">A team of AI agents running a store's chat, measured</p>
        <h1 id="overview-headline" className="max-w-4xl text-2xl leading-tight font-semibold text-forest-900 sm:text-3xl">
          A router hands each customer chat to a shopping agent or an orders &amp; returns agent. The rules live in code, and every reply is traced and tested.
        </h1>
        <p className="text-sm text-stone-600">
          Results below: {set.runs.map((r, i) => (
            <span key={r}>
              {i > 0 && ", "}
              <a className="text-forest-700 underline-offset-2 hover:underline" href={href.evalRun(r)}>
                {r}
              </a>
            </span>
          ))}{" "}
          ({SPLIT_LABEL[set.split]}{set.split === "test" ? ", never tuned on" : ""}). Judge {set.judge}. Intervals are 95%.
        </p>
      </section>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="space-y-1 rounded-xl border border-stone-200 bg-white p-4">
            <p className="text-sm text-stone-600">{t.label}</p>
            <p className={`text-3xl font-semibold ${t.warn ? "text-rust-600" : "text-forest-800"}`}>{t.value}</p>
            <p className="text-xs text-stone-500">{t.detail}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="The agent team" link={["#/agents", "Agents and history →"]}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg border border-dashed border-stone-400 px-3 py-2 text-sm text-stone-600">Customer</div>
            <Arrow />
            <RoleBox name={ROLE_LABEL.router} model={agents.roles.find((r) => r.role === "router")?.model} />
            <Arrow />
            <div className="flex flex-col items-start gap-1.5">
              <RoleBox name={ROLE_LABEL.shopping} model={agents.roles.find((r) => r.role === "shopping")?.model} />
              <p className="ml-3 text-xs text-stone-500">⇅ hand off to each other</p>
              <RoleBox name={ROLE_LABEL.support} model={agents.roles.find((r) => r.role === "support")?.model} />
            </div>
          </div>
          <p className="text-sm text-stone-600">
            Business rules live in the tools, not the prompts: prices only from quote_price, refunds over $50 go to a person, customers see only their own orders.
          </p>
        </Card>

        <Card title="The switch / retire decision" link={["#/agents", decision ? "Team history →" : "See the team history →"]}>
          {decision ? (
            <div className="space-y-2">
              <p className="font-semibold text-forest-900">
                {decision.role}: {decision.text}
              </p>
              <p className="text-sm text-stone-700">“{decision.change.reason}”</p>
              <p className="text-xs text-stone-500">
                Decided by {decision.change.decidedBy}, {decision.change.at.slice(0, 10)}
              </p>
              {decision.evidence.length > 0 && (
                <ul className="space-y-0.5 text-sm text-stone-700">
                  {decision.evidence.map((e) => (
                    <li key={e.model}>
                      <span className="font-medium">{e.model}</span>: {e.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-1 rounded-lg border border-dashed border-stone-300 bg-stone-25 p-4">
              <p className="font-semibold text-stone-700">No decision yet</p>
              <p className="text-sm text-stone-600">
                The team still runs its initial models. Once a model is switched or retired, this card shows what changed, the reason, and the numbers it rested on.
              </p>
            </div>
          )}
        </Card>
      </div>

      <Card title={`Task success by model · ${SPLIT_LABEL[set.split]}`} link={["#/comparison", "Full model comparison →"]}>
        <div className="space-y-3">
          {set.models.map((m) => {
            const bar = ciBar(m.report.taskSuccess);
            return (
              <div key={m.model} className="grid grid-cols-[minmax(0,9rem)_1fr_5.5rem] items-center gap-3 sm:grid-cols-[12rem_1fr_7rem]">
                <p className="truncate text-sm font-semibold" title={m.model}>
                  {shortModel(m.model)}
                </p>
                <div className="relative h-5 rounded bg-stone-100" role="img" aria-label={`${shortModel(m.model)}: ${Math.round(m.report.taskSuccess.rate * 100)}%, interval ${ciText(m.report.taskSuccess)}`}>
                  {bar && (
                    <>
                      <div className="absolute top-[7px] h-1.5 rounded bg-forest-100" style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />
                      <div className="absolute top-1 size-3 -translate-x-1/2 rounded-full bg-forest-800" style={{ left: `${bar.point}%` }} />
                    </>
                  )}
                </div>
                <p className="text-sm text-stone-700">
                  {Math.round(m.report.taskSuccess.rate * 100)}% <span className="text-stone-500">({ciText(m.report.taskSuccess).replace("%", "")})</span>
                </p>
              </div>
            );
          })}
          <div className="grid grid-cols-[minmax(0,9rem)_1fr_5.5rem] gap-3 sm:grid-cols-[12rem_1fr_7rem]">
            <span />
            <div className="flex justify-between text-[11px] text-stone-500">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
            <span />
          </div>
        </div>
        <p className={`rounded-lg p-3 text-sm ${set.winner.kind === "none" ? "bg-rust-50 text-stone-800" : "bg-forest-50 text-forest-900"}`}>{winnerText(set.winner)}</p>
      </Card>

      {curated.safety.length > 0 && (
        <section aria-labelledby="safety" className="space-y-3">
          <h2 id="safety" className="font-semibold text-forest-900">
            Safety by design · each links to the real conversation
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {curated.safety.map((f) => (
              <a key={f.caseId} href={href.evalConversation(f.run, f.model, f.caseId)} className="flex flex-col gap-1.5 rounded-xl border border-stone-200 bg-white p-4 hover:border-forest-600">
                <span className="text-sm font-semibold text-forest-900">{f.title}</span>
                <span className="text-sm text-stone-600">{f.text}</span>
                <span className="mt-auto text-xs text-forest-700">
                  {f.caseId} · {shortModel(f.model)} · {f.run} →
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <Card title="What the evals caught">
        <ul className="space-y-3">
          {gap && <FindingRow date="Now" title={gap.title} text={gap.text} status="open" />}
          {curated.findings.map((f) => (
            <FindingRow key={f.title} date={f.date} title={f.title} text={f.text} status={f.status} />
          ))}
        </ul>
      </Card>

      <nav aria-label="Next steps" className="flex flex-wrap gap-2.5">
        <a href={SITE_ROOT} className="rounded-lg bg-forest-800 px-4 py-3 text-sm font-semibold text-white hover:bg-forest-700">
          {IS_STATIC ? "Watch recorded store chats" : "Try the store chat"}
        </a>
        {(
          [
            ["#/comparison", "Model comparison"],
            ["#/evals", "Eval conversations"],
            ["#/approvals", "Approvals queue"],
            ["#/agents", "Agents"],
          ] as const
        ).map(([to, label]) => (
          <a key={to} href={to} className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm text-forest-800 hover:border-forest-600">
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function Card({ title, link, children }: { title: string; link?: readonly [string, string]; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-forest-900">{title}</h2>
        {link && (
          <a href={link[0]} className="text-sm text-forest-700 hover:underline">
            {link[1]}
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

function RoleBox({ name, model }: { name: string; model: string | undefined }) {
  return (
    <div className="rounded-lg border border-forest-700 bg-forest-50 px-3 py-2">
      <p className="text-sm font-semibold text-forest-900">{name}</p>
      <p className="text-xs text-stone-600">{model ? shortModel(model) : "–"}</p>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true" className="shrink-0 text-stone-500">
      <path d="M0 6h24M19 1l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const STATUS_LABEL: Record<Finding["status"], { text: string; tone: string }> = {
  fixed: { text: "Fixed", tone: "text-forest-700" },
  fixed_not_remeasured: { text: "Fixed in code, not re-measured yet", tone: "text-rust-600" },
  open: { text: "Open", tone: "text-rust-600" },
};

function FindingRow({ date, title, text, status }: { date: string; title: string; text: string; status: Finding["status"] }) {
  const s = STATUS_LABEL[status];
  return (
    <li className="grid gap-1 sm:grid-cols-[6.5rem_1fr] sm:gap-3">
      <p className="text-xs text-stone-500">{date}</p>
      <div className="space-y-0.5">
        <p className="text-sm text-stone-800">
          <span className="font-semibold">{title}.</span> {text}
        </p>
        <p className={`text-xs font-medium ${s.tone}`}>{s.text}</p>
      </div>
    </li>
  );
}
