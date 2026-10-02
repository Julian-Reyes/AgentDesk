import type { TraceStep } from "../lib/api.ts";
import { byTurn, describeStep, type StepView } from "./steps.ts";

const TONE: Record<StepView["tone"], string> = {
  customer: "border-l-sky-500 bg-sky-50",
  router: "border-l-stone-400 bg-white",
  model: "border-l-stone-300 bg-white",
  tool: "border-l-forest-600 bg-white",
  reply: "border-l-forest-700 bg-forest-50",
  warn: "border-l-amber-500 bg-amber-50",
  error: "border-l-rust-600 bg-rust-50",
};

/** A conversation's trace, turn by turn. Every step can be opened to its raw JSON. */
export function Timeline({ steps }: { steps: TraceStep[] }) {
  if (steps.length === 0) return <p className="text-sm text-stone-500">No steps recorded.</p>;
  return (
    <ol className="space-y-5">
      {byTurn(steps).map(({ turn, steps: turnSteps }) => (
        <li key={turn}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">Turn {turn}</h3>
          <ol className="space-y-2">
            {turnSteps.map((st, i) => (
              <Step key={st.seq ?? i} step={st} />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function Step({ step }: { step: TraceStep }) {
  const v = describeStep(step);
  return (
    <li className={`rounded border border-l-4 border-stone-200 p-3 text-sm ${TONE[v.tone]}`}>
      <p className="font-medium break-words">{v.title}</p>
      {v.body && <p className="mt-1 whitespace-pre-wrap break-words text-stone-800">{v.body}</p>}
      {v.meta.length > 0 && <p className="mt-1 text-xs text-stone-500">{v.meta.join(" · ")}</p>}
      {v.flags.map((f) => (
        <p key={f} className="mt-1 text-xs font-medium text-amber-800">
          {f}
        </p>
      ))}
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-stone-500">Raw step</summary>
        <pre className="mt-1 max-h-80 overflow-auto rounded bg-stone-100 p-2 text-xs">{JSON.stringify(step, null, 2)}</pre>
      </details>
    </li>
  );
}
