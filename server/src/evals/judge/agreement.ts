import type { JudgeOutput } from "./judge.ts";
import type { HumanGrade, JudgeVerdict, KeyEntry, Scores } from "./sample.ts";

/**
 * How often a judge agrees with Julian (or with another judge), with 95%
 * confidence intervals: for 1-5 scores, exact matches and matches within ±1;
 * for yes/no answers, the share that agree. Also broken down by the agent model
 * that wrote the reply, which is where self-grading bias would show.
 */

export type Rate = { agree: number; n: number; rate: number; ci: [number, number] };

/** Wilson score interval: honest for small n and rates near 0 or 1 (unlike ±1.96·SE). */
export function wilson(agree: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = agree / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const rate = (agree: number, n: number): Rate => ({ agree, n, rate: n ? agree / n : 0, ci: wilson(agree, n) });

export type DimensionAgreement = { exact: Rate; within1: Rate; /** Mean of (judge − reference): positive means the judge scores higher. */ meanDiff: number };
export type Agreement = { n: number; dimensions: Record<keyof Scores, DimensionAgreement>; answers: Rate };

export type Pair = { agentModel: string; a: Scores & { answers: Record<string, boolean> }; b: Scores & { answers: Record<string, boolean> } };

const DIMS = ["tone", "clarity", "helpfulness"] as const;

export function agreementOf(pairs: Pair[]): Agreement {
  const dimensions = {} as Agreement["dimensions"];
  for (const d of DIMS) {
    const diffs = pairs.map((p) => p.a[d] - p.b[d]);
    dimensions[d] = {
      exact: rate(diffs.filter((x) => x === 0).length, diffs.length),
      within1: rate(diffs.filter((x) => Math.abs(x) <= 1).length, diffs.length),
      meanDiff: diffs.length ? diffs.reduce((s, x) => s + x, 0) / diffs.length : 0,
    };
  }
  let agree = 0;
  let n = 0;
  for (const p of pairs) {
    for (const [id, answer] of Object.entries(p.b.answers)) {
      if (id in p.a.answers) {
        n += 1;
        if (p.a.answers[id] === answer) agree += 1;
      }
    }
  }
  return { n: pairs.length, dimensions, answers: rate(agree, n) };
}

export type AgreementReport = { overall: Agreement; byModel: Record<string, Agreement>; byQuestion: Record<string, Rate> };

export function report(pairs: Pair[]): AgreementReport {
  const models = [...new Set(pairs.map((p) => p.agentModel))].sort();
  return {
    overall: agreementOf(pairs),
    byModel: Object.fromEntries(models.map((m) => [m, agreementOf(pairs.filter((p) => p.agentModel === m))])),
    byQuestion: answersByGroup(pairs),
  };
}

const asSide = (v: JudgeVerdict) => ({ ...v.scores, answers: v.answers });

/** Which verdict of a key entry to use: the drawn one, or one added later by verdictKey. */
export type VerdictPick = (k: KeyEntry) => JudgeVerdict | null | undefined;
export const drawn: VerdictPick = (k) => k.judge;
export const added = (key: string): VerdictPick => (k) => k.verdicts?.[key];

/** Pairs a judge's verdicts with Julian's grades. Items without both are left out. */
export function pairsWithHuman(key: KeyEntry[], grades: Record<string, HumanGrade>, pick: VerdictPick): Pair[] {
  return key.flatMap((k) => {
    const v = pick(k);
    const g = grades[k.itemId];
    return v && g ? [{ agentModel: k.agentModel, a: asSide(v), b: { tone: g.tone, clarity: g.clarity, helpfulness: g.helpfulness, answers: g.answers } }] : [];
  });
}

/** Pairs two judges' verdicts with each other. */
export function pairsBetweenJudges(key: KeyEntry[], a: VerdictPick, b: VerdictPick): Pair[] {
  return key.flatMap((k) => {
    const va = a(k);
    const vb = b(k);
    return va && vb ? [{ agentModel: k.agentModel, a: asSide(va), b: asSide(vb) }] : [];
  });
}

/** The question groups the yes/no agreement is broken down by: the two voted global checks, the case checks, script fit. */
export function questionGroup(id: string): string {
  if (id === "judge:followup" || id === "judge:timing") return id;
  return id.startsWith("script:") ? "script fit" : "case checks";
}

/** Yes/no agreement per question group, across all pairs. */
export function answersByGroup(pairs: Pair[]): Record<string, Rate> {
  const counts = new Map<string, { agree: number; n: number }>();
  for (const p of pairs) {
    for (const [id, answer] of Object.entries(p.b.answers)) {
      if (!(id in p.a.answers)) continue;
      const g = counts.get(questionGroup(id)) ?? { agree: 0, n: 0 };
      g.n += 1;
      if (p.a.answers[id] === answer) g.agree += 1;
      counts.set(questionGroup(id), g);
    }
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([g, c]) => [g, rate(c.agree, c.n)]));
}

/**
 * Pairs two judges' verdicts on the same conversations (a whole eval run, not
 * the 30-reply sample): one pair per reply for the scores. Yes/no answers are
 * per conversation, so they ride on the first reply's pair only and are
 * counted once.
 */
export function pairsFromOutputs(both: { agentModel: string; a: JudgeOutput; b: JudgeOutput }[]): Pair[] {
  const answers = (o: JudgeOutput) => Object.fromEntries([...o.checks, ...o.scriptFit].map((x) => [x.id, x.answer]));
  return both.flatMap(({ agentModel, a, b }) =>
    a.replies.flatMap((ra, i) => {
      const rb = b.replies.find((x) => x.reply === ra.reply);
      if (!rb) return [];
      const side = (r: typeof ra, o: JudgeOutput) => ({ tone: r.tone, clarity: r.clarity, helpfulness: r.helpfulness, answers: i === 0 ? answers(o) : {} });
      return [{ agentModel, a: side(ra, a), b: side(rb, b) }];
    }),
  );
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmtRate = (r: Rate) => (r.n ? `${pct(r.rate)} (${r.agree}/${r.n}, 95% CI ${pct(r.ci[0])}–${pct(r.ci[1])})` : "n/a");

export function renderReport(title: string, r: AgreementReport): string {
  const rows = (a: Agreement) =>
    DIMS.map((d) => `| ${d} | ${fmtRate(a.dimensions[d].exact)} | ${fmtRate(a.dimensions[d].within1)} | ${a.dimensions[d].meanDiff >= 0 ? "+" : ""}${a.dimensions[d].meanDiff.toFixed(2)} |`);
  const out = [
    `### ${title}`,
    "",
    `Overall (${r.overall.n} replies); yes/no answers agree: ${fmtRate(r.overall.answers)}`,
    "",
    "| Dimension | Exact | Within ±1 | Mean difference (first − second) |",
    "| --- | --- | --- | --- |",
    ...rows(r.overall),
    "",
    "| Yes/no question | Agree |",
    "| --- | --- |",
    ...Object.entries(r.byQuestion).map(([g, rt]) => `| ${g} | ${fmtRate(rt)} |`),
    "",
  ];
  for (const [model, a] of Object.entries(r.byModel)) {
    out.push(`**Replies by ${model}** (${a.n}); yes/no: ${fmtRate(a.answers)}`, "", "| Dimension | Exact | Within ±1 | Mean difference |", "| --- | --- | --- | --- |", ...rows(a), "");
  }
  return out.join("\n");
}
