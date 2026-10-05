import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalCase } from "../case-schema.ts";
import type { CaseGrade } from "../grading/grade.ts";
import type { JudgeInput, JudgeOutput } from "../judge/judge.ts";
import type { Observation } from "../run-case.ts";

/**
 * A run's files. Each finished conversation is one file, written atomically,
 * so the files themselves are the checkpoint: a stopped run resumes by
 * skipping cases that already have one. Judge results live in their own tree
 * keyed by judge model and rubric version, so saved conversations can be
 * re-judged (another judge, a new rubric) without replaying any agent calls.
 *
 *   <root>/<run>/manifest.json
 *   <root>/<run>/conversations/<model>/<caseId>.json
 *   <root>/<run>/judge/<judge model>/<rubric>/<model>/<caseId>.json
 *   <root>/<run>/report.md, judged.jsonl
 */

export const DEFAULT_RESULTS_DIR = fileURLToPath(new URL("../../../eval-results/runs", import.meta.url));

export type ConversationStats = {
  modelCalls: number;
  cachedCalls: number;
  /** Tool calls other than reply. */
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  /** Sum of model-call latencies (the model's own time, without our throttle waits). */
  latencyMs: number;
  /** Per turn: the sum of that turn's model-call latencies. */
  turnLatencyMs: number[];
  costMicros: number;
  /** Wall time for the conversation, throttle waits included. */
  wallMs: number;
};

export type ConversationRecord = {
  caseId: string;
  /** The case as it was when run, so later edits to the case can't change how this run is judged. */
  case: EvalCase;
  agentModel: string;
  team: Record<string, unknown>;
  observation: Observation;
  grade: CaseGrade;
  stats: ConversationStats;
  /** Set when a turn failed because a provider was unreachable or kept erroring (not the model's own output). */
  providerError?: string;
  finishedAt: string;
  /** Earlier snapshots of the case, oldest first, when an approved case change was applied to this saved run (updateCaseSnapshots). */
  caseHistory?: { case: EvalCase; replacedAt: string; reason: string }[];
};

export type JudgeRecord = {
  caseId: string;
  /** The judged conversation's run id: a re-run conversation gets a new id, so an old verdict can't be mistaken for its own. */
  runId: string;
  /** Hash of the questions answered (questionSetOf): a verdict only counts for the same questions. */
  questionSet: string;
  agentModel: string;
  judgeModel: string;
  rubric: string;
  input: JudgeInput;
  ok: boolean;
  output?: JudgeOutput;
  answers?: Record<string, boolean>;
  error?: string;
  /** purpose (rubric@2+): "scores", a question id, or "<id> vote <n>". */
  calls: { purpose?: string; latencyMs: number; inputTokens: number; outputTokens: number; cached: boolean; raw: string | null; error?: string }[];
};

export type Manifest = {
  name: string;
  split: string;
  models: string[];
  caseIds: string[];
  createdAt: string;
  notes?: string;
  /** The agents' prompt set (agents/prompts.ts PROMPT_SETS). Missing on runs saved before prompt sets existed, which used round-0. */
  promptSet?: string;
  /** LLM_CACHE mode the agents ran with. "refresh" means every model call was made fresh (repeat runs); missing on runs from before round 2. */
  cacheMode?: string;
  /** Approved case changes applied to this run after it ran (no agent calls replayed). */
  caseUpdates?: { at: string; reason: string; caseIds: string[] }[];
};

export const slug = (id: string) => id.replaceAll("/", "__");

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path); // atomic: a crash never leaves a half-written checkpoint
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

export class RunStore {
  readonly dir: string;
  constructor(name: string, root = DEFAULT_RESULTS_DIR) {
    this.dir = join(root, name);
  }

  manifest(): Manifest | null {
    const p = join(this.dir, "manifest.json");
    return existsSync(p) ? readJson<Manifest>(p) : null;
  }
  saveManifest(m: Manifest) {
    writeJson(join(this.dir, "manifest.json"), m);
  }

  private convPath(model: string, caseId: string) {
    return join(this.dir, "conversations", slug(model), `${caseId}.json`);
  }
  hasConversation(model: string, caseId: string) {
    return existsSync(this.convPath(model, caseId));
  }
  saveConversation(r: ConversationRecord) {
    writeJson(this.convPath(r.agentModel, r.caseId), r);
  }
  removeConversation(model: string, caseId: string) {
    rmSync(this.convPath(model, caseId), { force: true });
  }
  conversations(): ConversationRecord[] {
    const root = join(this.dir, "conversations");
    if (!existsSync(root)) return [];
    return readdirSync(root).flatMap((m) =>
      readdirSync(join(root, m))
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => readJson<ConversationRecord>(join(root, m, f))),
    );
  }

  private judgePath(judgeModel: string, rubric: string, model: string, caseId: string) {
    return join(this.dir, "judge", slug(judgeModel), rubric.replace("#", "_"), slug(model), `${caseId}.json`);
  }
  judgeRecord(judgeModel: string, rubric: string, model: string, caseId: string): JudgeRecord | null {
    const p = this.judgePath(judgeModel, rubric, model, caseId);
    return existsSync(p) ? readJson<JudgeRecord>(p) : null;
  }
  /** Every judge (model + rubric) with at least one saved verdict in this run, read from the verdicts themselves. */
  judges(): { model: string; rubric: string }[] {
    const root = join(this.dir, "judge");
    if (!existsSync(root)) return [];
    const found = new Map<string, { model: string; rubric: string }>();
    for (const judgeDir of readdirSync(root).sort()) {
      for (const rubricDir of readdirSync(join(root, judgeDir)).sort()) {
        for (const modelDir of readdirSync(join(root, judgeDir, rubricDir)).sort()) {
          const file = readdirSync(join(root, judgeDir, rubricDir, modelDir)).find((f) => f.endsWith(".json"));
          if (!file) continue;
          const r = readJson<JudgeRecord>(join(root, judgeDir, rubricDir, modelDir, file));
          found.set(`${r.judgeModel} ${r.rubric}`, { model: r.judgeModel, rubric: r.rubric });
          break;
        }
      }
    }
    return [...found.values()];
  }
  saveJudge(r: JudgeRecord) {
    writeJson(this.judgePath(r.judgeModel, r.rubric, r.agentModel, r.caseId), r);
  }

  writeText(file: string, text: string) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, file), text);
  }
}
