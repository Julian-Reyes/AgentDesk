# Progress: current status

Read this file at the start of a session. The full history, with every decision and its reasons, is in `docs/history/M1.md` … `M5.md`. Open those only when a task needs the detail. The spec is `docs/PROJECT.md`.

_Last updated 2026-10-05._

## Milestones
| | Status | History |
| --- | --- | --- |
| M1 Store data + tools | ✅ Closed 2026-09-28 | [M1](docs/history/M1.md) |
| M2 Agent loop | ✅ Closed 2026-09-29 | [M2](docs/history/M2.md) |
| M3 Evals | In progress (approved overlap with M4/M5) | [M3](docs/history/M3.md) |
| M4 UI | ✅ Closed 2026-10-02 | [M4](docs/history/M4.md) |
| M5 Deploy | In progress: overview page built; plan in `docs/M5_PLAN.md` (draft) | [M5](docs/history/M5.md) |
| M6 Case study, polish | Not started | |

## Where things stand
- **Held-out results (`test-1`, 2026-10-05, 110 cases × 3 models; judge gpt-oss-20b, `rubric@4`).** Task success:
  - Flash-Lite 72% (78/109, 62–79%)
  - gpt-oss-120b 72% (79/110, 63–79%)
  - qwen3.8-27b 65% (71/109, 56–73%)

  Policy violations 1 / 2 / 1, so the comparison names **no winner**. Every model scores below its dev result. Details: M3, "`test-1` results".
- **The team runs Flash-Lite in all three roles.** No switch/retire decision yet: Julian makes it on the Agents page (needs the admin token).
- **Since test-1, changed in code and not re-measured:**
  - the damage-cause rule (`arrived_damaged` vs `damaged_after_delivery`)
  - catching tool calls written out as reply text

  The tool descriptions changed, so later runs aren't strictly comparable with test-1; label them as after these changes.
- **Eval sets:** dev 43 cases (3 added 2026-10-05 for the damage-cause rule), test 110 (frozen, never tuned on).
- **Rename:** "Switchyard Lite" is now **AgentDesk**. The local databases are `agentdesk_dev` / `agentdesk_test`.

## Budget
- **Groq:** ≈ $6.76 of the $8 cycle spent, counted from 2026-09-30. The reset date is unknown (Julian: Groq console → Settings → Billing).
- **Flash-Lite:** free, ~500 requests/day, resets at 04:00 local.
- **Modal:** unused.
- Any run costs: give an estimate first.

## Next
1. **GitHub:** private repo `Julian-Reyes/AgentDesk`. CI (`.github/workflows/ci.yml`) runs typecheck + tests against a Postgres 17 service on every push to `main` and every PR; no secrets, no model calls.
2. **M5, the public site is live: https://julianreyes.dev/AgentDesk/** (dashboard: `/AgentDesk/ops/`), deployed 2026-10-05 from snapshot `d50fa53`. It's a static, read-only snapshot on GitHub Pages; the repo is public. To update it: commit, `npm run export:static`, commit `site-data/`, push; CI rebuilds and deploys. **Not checked in a real browser yet:** the chat recordings playing, and phone width. Next: the switch/retire decision (Julian, locally), then re-export and push.
3. **Re-measure the damage-cause rule:** the 6 dev damage cases on gpt-oss-120b + Flash-Lite. About $0.03 per run, or about $0.10 for 3 repeats. Optionally the 13 test damage cases (about $0.05), reported as a check after the change, not a new held-out score.
4. **Phone-width check** of the overview, Agents and Runs pages (headless Chrome hangs; check by hand).

## Open items
- **M3:**
  - judge score calibration on weak replies
  - the 4th (small open, local) model
  - gpt-oss-120b's follow-up promises (5 of 110 on test)
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
