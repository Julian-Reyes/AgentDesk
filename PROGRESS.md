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
| M5 Deploy | In progress: overview page built; plan in `docs/M5_PLAN.md` (draft) | [M5](docs/history/M5.md) |
| M6 Story: final comparison runs, README, case study, polish | Not started | |
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
- **Groq:** ≈ $6.85 of the $8 cycle spent, counted from 2026-09-30. The reset date is unknown (Julian: Groq console → Settings → Billing).
- **Flash-Lite:** free, ~500 requests/day, resets at 04:00 local.
- **Modal:** unused.
- Any run costs: give an estimate first.

## Next
1. **The public site is live: https://julianreyes.dev/AgentDesk/** (dashboard: `/AgentDesk/ops/`). It's a static, read-only snapshot on GitHub Pages; the repo is public. Last deployed 2026-10-06 from snapshot `7bf5017` (`dev-dmg` complete).
   - To update it: commit, `npm run export:static`, commit `site-data/`, push. CI rebuilds and deploys.
   - **Julian checks it on his phone.**
2. **M6 (Story): plan proposed 2026-10-06, to agree with Julian.** Final comparison runs, README, case study, polish.
3. **Round 3 (planned, not started):** a code guard in `issue_refund`: a damaged refund on a multi-item order only for an item the customer named in their own messages, else "ask the customer which item". It ships with any prompt changes and is measured in a new labelled run. Design notes in M3 history, "Julian's decisions on `dev-dmg`".
4. **Further switch/retire decisions (Julian)** after that run. Then re-export and push.

## Open items
- **Carried from M3** (closed 2026-10-06; details in M3 history, "Milestone 3 closed"):
  - judge score calibration on weak replies
  - gpt-oss-120b's follow-up and timing promises (5 of 110 on test)
  - Flash-Lite guesses the damaged item instead of asking (dev; the round-3 guard)
  - changes since test-1 aren't measured on the test set (damage-cause rule, tool calls written as text, the round-3 guard)
- **M4 → M5:**
  - quality intervals can go past 5 (clamp or use a bounded method, then re-generate the reports)
  - decide whether the Approvals page's model-written notes are admin-only
  - demo-only example approvals, kept out of the eval seed
  - live chats are in memory
  - one shared admin token, not a real login
- **M5:** hosting, public-demo limits and admin login. `docs/M5_PLAN.md` is still a draft to agree with Julian.

## How to run
See `README.md`. In short:
```sh
npm install
npm run db:migrate && npm run db:seed
npm run dev
npm run typecheck && npm test
```
The pre-commit hook runs typecheck and tests (`git config core.hooksPath .githooks`). `ADMIN_TOKEN` must be at least 24 characters.
