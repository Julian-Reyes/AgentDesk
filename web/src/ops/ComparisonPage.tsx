import { useEffect, useState, type ReactNode } from "react";
import { getComparisonList, getComparisonSet, type ComparisonList, type ComparisonSet, type Rate } from "../lib/api.ts";
import { SPLIT_NOTE, ciBar, ciText, gapText, latency, meanText, rateText, winnerText } from "./comparison.ts";

/**
 * One row per model for the chosen comparison set. Every number comes from
 * the set's precomputed file (npm run eval:sets), which pools the same saved
 * runs as the committed reports.
 */
export function ComparisonPage() {
  const [list, setList] = useState<ComparisonList | null>(null);
  const [setId, setSetId] = useState<string | null>(null);
  const [set, setSet] = useState<ComparisonSet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getComparisonList().then(
      (l) => {
        setList(l);
        setSetId(l.default);
      },
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(() => {
    if (!setId) return;
    setSet(null);
    getComparisonSet(setId).then(setSet, (e: Error) => setError(e.message));
  }, [setId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Model comparison</h1>
        {list && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-stone-600">Results</span>
            <select value={setId ?? ""} onChange={(e) => setSetId(e.target.value)} className="min-w-0 rounded border border-stone-300 px-2 py-1">
              {list.sets.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.generated}>
                  {s.label}
                  {s.generated ? "" : " (not generated)"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <p className="rounded-md bg-rust-50 p-3 text-sm text-rust-600">{error}</p>}
      {!set && !error && <p className="text-stone-500">Loading…</p>}
      {set && <SetView set={set} />}
    </div>
  );
}

function SetView({ set }: { set: ComparisonSet }) {
  const winner = set.winner.kind === "none" ? null : set.winner.model;
  return (
    <>
      <p className={`rounded-md p-3 text-sm ${set.split === "dev" ? "bg-rust-50 text-rust-600" : "bg-forest-50 text-forest-800"}`}>
        {SPLIT_NOTE[set.split]}
      </p>
      <p className="rounded-md border border-stone-200 bg-white p-3 text-sm">{winnerText(set.winner)}</p>
      <p className="text-xs text-stone-500">
        Runs {set.runs.join(", ")} (prompts {set.promptSets.join(", ")}), pooled per model. Judge {set.judge}. Rates show 95% Wilson intervals; quality is the judge's 1–5
        score with a 95% interval. Each eval runs one model in all three roles.
      </p>

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[68rem] border-separate border-spacing-0 text-left text-sm">
          <thead className="text-xs text-stone-500">
            <tr>
              <Th>Model</Th>
              <Th>Task success</Th>
              <Th>Routing</Th>
              <Th>Shopping cases</Th>
              <Th>Support cases</Th>
              <Th>Policy</Th>
              <Th>Grounding</Th>
              <Th>Escalated</Th>
              <Th>Tone / clarity / helpfulness</Th>
              <Th>Turn p50 / p95</Th>
              <Th>Cost</Th>
              <Th>Bad tool calls (rejected / invalid / unknown)</Th>
            </tr>
          </thead>
          <tbody>
            {set.models.map(({ model, report: r, repeats, repeatGap }) => (
              <tr key={model} className={model === winner ? "bg-forest-50" : "bg-white"}>
                <Td>
                  <span className="font-medium">{model}</span>
                  {model === winner && <span className="block text-xs text-forest-700">{set.winner.kind === "significant" ? "winner" : "leads, not significant"}</span>}
                </Td>
                <Td>
                  <RateWithBar rate={r.taskSuccess} />
                  {repeats.length > 1 && (
                    <span className="block max-w-[10rem] text-xs whitespace-normal text-stone-500">
                      repeats {repeats.map((x) => rateText(x.taskSuccess)).join(", ")}; gap {gapText(repeatGap)}
                    </span>
                  )}
                </Td>
                <Td>{rateText(r.routing)}</Td>
                <Td>{rateText(r.byAgent.shopping)}</Td>
                <Td>{rateText(r.byAgent.support)}</Td>
                <Td>
                  <span className={r.policyViolations ? "font-semibold text-rust-600" : ""}>{r.policyViolations}</span>
                </Td>
                <Td>
                  {r.groundingViolations} <span className="block text-xs text-stone-500">in {rateText(r.conversationsWithGrounding)}</span>
                </Td>
                <Td>{rateText(r.escalation)}</Td>
                <Td>
                  {r.quality ? (
                    <span className="block text-xs leading-5">
                      {meanText(r.quality.tone)}
                      <br />
                      {meanText(r.quality.clarity)}
                      <br />
                      {meanText(r.quality.helpfulness)}
                    </span>
                  ) : (
                    "–"
                  )}
                </Td>
                <Td>
                  {latency(r.turnLatencyMs.p50)} / {latency(r.turnLatencyMs.p95)}
                </Td>
                <Td>${r.costUsd.toFixed(2)}</Td>
                <Td>
                  {r.health.rejectedByProvider} / {r.health.invalidArgs} / {r.health.unknownTool}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        Policy and Grounding are violation counts (policy must be 0; grounding also shows the share of conversations with one). Task success counts pass ÷ (pass + fail); script mismatches, judge failures and provider errors are left out. Conversations: {set.models.map((m) => `${m.model} ${m.report.conversations}`).join(", ")}.
      </p>
    </>
  );
}

function RateWithBar({ rate }: { rate: Rate }) {
  const bar = ciBar(rate);
  return (
    <div className="w-40">
      <span className="font-semibold">{rateText(rate)}</span>
      {bar && (
        <>
          <div className="relative mt-1 h-2 rounded bg-stone-200" role="img" aria-label={`95% interval ${ciText(rate)}`}>
            <div className="absolute inset-y-0 rounded bg-forest-600/40" style={{ left: `${bar.left}%`, width: `${bar.width}%` }} />
            <div className="absolute inset-y-[-2px] w-0.5 bg-forest-800" style={{ left: `${bar.point}%` }} />
          </div>
          <span className="text-xs text-stone-500">{ciText(rate)}</span>
        </>
      )}
    </div>
  );
}

const Th = ({ children }: { children: ReactNode }) => <th className="border-b border-stone-200 px-2 py-2 align-bottom font-normal">{children}</th>;
const Td = ({ children }: { children: ReactNode }) => <td className="border-b border-stone-100 px-2 py-2 align-top whitespace-nowrap">{children}</td>;
