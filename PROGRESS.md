# Progress: current status

Read this file at the start of a session. The full history, with every decision and its reasons, is in `docs/history/M1.md` … `M5.md`. Open those only when a task needs the detail. The spec is `docs/PROJECT.md`.

_Last updated 2026-10-06._

## Milestones
| | Status | History |
| --- | --- | --- |
| M1 Store data + tools | ✅ Closed 2026-09-28 | [M1](docs/history/M1.md) |
| M2 Agent loop | ✅ Closed 2026-09-29 | [M2](docs/history/M2.md) |
| M3 Evals | ✅ Closed 2026-10-06 (open items carried below) | [M3](docs/history/M3.md) |
| M4 UI | ✅ Closed 2026-10-02 | [M4](docs/history/M4.md) |
| M5 Deploy | ✅ Closed 2026-10-06 | [M5](docs/history/M5.md) |
| M6 Story: final comparison runs, README, case study, polish | In progress: plan in `docs/M6_PLAN.md` (agreed 2026-10-06) | [M6](docs/history/M6.md) |
| M7 Live chat on the public site (optional) | Not started; starting plan in `docs/M5_PLAN.md` §6 (Render, Cloudflare or Fly.io, which Julian already uses) | |
| M8 Small open model, the 4th in the comparison (optional) | Not started; deferred from M3 on 2026-10-06. Ollama on the Mac mini for development, vLLM on Modal for official runs (cost estimate and spending limit first). Setup: `docs/OLLAMA_MAC_MINI.md` | |

## Where things stand
- **Held-out results (`test-1`, 2026-10-05, 110 cases × 3 models; judge gpt-oss-20b, `rubric@4`).** Task success:
  - Flash-Lite 72% (78/109, 62–79%)
  - gpt-oss-120b 72% (79/110, 63–79%)
  - qwen3.8-27b 65% (71/109, 56–73%)

  Policy violations 1 / 2 / 1, so the comparison names **no winner**. Every model scores below its dev result. Details: M3, "`test-1` results".
- **The team runs Flash-Lite in all three roles.** **First retire decision (Julian, 2026-10-05):** `groq/qwen3.8-27b` retired from the shopping role ("Worst performer of the group"; test-1 shopping cases: 59%, 43–72%, vs Flash-Lite 78%, gpt-oss-120b 83%). It's published on the public overview. More decisions can follow the next labelled test run.
- **Since test-1, changed in code:**
  - the damage-cause rule (`arrived_damaged` vs `damaged_after_delivery`): **re-measured on dev (`dev-dmg-1`…`3`, 2026-10-06):** it held for both models (0 of 6 dropped or failed-after-use lamps refunded, every legitimate damage refund made, 0 policy violations). Passed: Flash-Lite 14/18, gpt-oss-120b 13/18
  - catching tool calls written out as reply text: saved runs re-graded; not re-measured live

  The tool descriptions changed, so later runs aren't strictly comparable with test-1; label them as after these changes.
- **Eval sets:** dev 43 cases (3 added 2026-10-05 for the damage-cause rule), test 110 (frozen, never tuned on).
- **Rename:** "Switchyard Lite" is now **AgentDesk**. The local databases are `agentdesk_dev` / `agentdesk_test`.

## Budget
- **Groq:** ≈ $7.52 of the $8 cycle spent, counted from 2026-09-30. The reset date is unknown (Julian: Groq console → Settings → Billing).
- **Gemini:** paid tier since 2026-10-06 14:05 UTC, **capped at $5/month** (Google Cloud). Flash-Lite $0.30 / $2.50 per 1M, no daily cap. ≈ $0.43 recorded so far (up to ≈ $0.59 if `dev-r3` was billed).
- **Modal:** unused.
- Any run costs: give an estimate first.

## Next
1. **The public site is live: https://julianreyes.dev/AgentDesk/** (dashboard: `/AgentDesk/ops/`). It's a static, read-only snapshot on GitHub Pages; the repo is public. Last deployed 2026-10-06 from snapshot `7bf5017` (`dev-dmg` complete).
   - To update it: commit, `npm run export:static`, commit `site-data/`, push. CI rebuilds and deploys.
   - **Julian checks it on his phone.**
2. **M6 (Story), in progress; plan `docs/M6_PLAN.md`.**
   - ✅ Round 3's item guard built and checked on dev (`dev-r3`: Flash-Lite 86%, gpt-oss-120b 69%; the guard fired once, and the agent asked).
   - ✅ Flash-Lite on the paid tier (2026-10-06): real cost recorded, tier in manifests, latency flagged in reports.
   - ✅ **`test-2`** (2026-10-06, ≈ $0.82): Flash-Lite **78%** (69–85%), gpt-oss-120b **63%** (53–71%); policy violations **1 / 1** after refunds were graded per order (Julian, 2026-10-06), so **no winner**. Both moves are within run-to-run variation. Dropped or failed lamps refunded on test: 0 of 4 (`test-1`: 3). Details: M6 history.
   - **No switch/retire decision yet** (Julian, 2026-10-06). Site re-exported with `test-2`.
   - **Open: the 25% → 10% coupon** (`test-refund-over-limit-07`, both models' only remaining violation; Qwen's in `test-1`). The "pass on the customer's actual request" rule lives only in the cases and the grader; agents aren't told and code doesn't enforce it. Options with Julian.
   - Then Julian's switch/retire decisions, README, the case study (Claude drafts, Julian edits; sections 1–4 drafted), polish.

## Open items
- **Carried from M3** (closed 2026-10-06; details in M3 history, "Milestone 3 closed"):
  - judge score calibration on weak replies
  - gpt-oss-120b's follow-up and timing promises (5 of 110 on test)
  - Flash-Lite guesses the damaged item instead of asking (dev; fixed by the round-3 guard, to confirm on test-2)
  - **Known weakness (Julian, 2026-10-06):** the damage-cause rule trusts the model's cause; gpt-oss-120b refunded a lamp that failed after use as `arrived_damaged` (`dev-r3-dmg-2`, 1 of 12 tries)
  - changes since test-1 aren't measured on the test set (damage-cause rule, tool calls written as text, the round-3 guard)
- **Carried from M4/M5, into M6 polish:**
  - phone width, and recordings playing in a browser
  - quality intervals can go past 5
  - whether the Approvals page's model-written notes are admin-only
- **Config:**
  - Gemini 3.8 Flash's price doubles on 2027-01-01 ($1.50 / $7.50); update `models.json` then.
  - Kimi K2.5 (via OpenRouter, pinned provider) and DeepSeek Flash are parked until M7 (`docs/M5_PLAN.md` §6): no accounts or calls before then; prepaid caps agreed then. DeepSeek's config stays in `models.json`, unused.
- **Carried, only for M7:** live chats are in memory; one shared admin token, not a real login.

## How to run
See `README.md`. In short:
```sh
npm install
npm run db:migrate && npm run db:seed
npm run dev
npm run typecheck && npm test
```
The pre-commit hook runs typecheck and tests (`git config core.hooksPath .githooks`). `ADMIN_TOKEN` must be at least 24 characters.
