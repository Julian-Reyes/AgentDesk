# Progress: current status

Read this file at the start of a session. The full history, with every decision and its reasons, is in `docs/history/M1.md` … `M5.md`. Open those only when a task needs the detail. The spec is `docs/PROJECT.md`.

_Last updated 2026-10-06._

## Milestones
| | Status | History |
| --- | --- | --- |
| M1 Store data + tools | ✅ Closed 2026-09-28 | [M1](docs/history/M1.md) |
| M2 Agent loop | ✅ Closed 2026-09-29 | [M2](docs/history/M2.md) |
| M3 Evals | ✅ Closed 2026-10-06 | [M3](docs/history/M3.md) |
| M4 UI | ✅ Closed 2026-10-02 | [M4](docs/history/M4.md) |
| M5 Deploy | ✅ Closed 2026-10-06 | [M5](docs/history/M5.md) |
| M6 Story: final comparison runs, README, case study, polish | ✅ Closed 2026-10-06 (four items carried for Julian, below) | [M6](docs/history/M6.md) |
| M7 Live chat on the public site, and new models (optional) | Not started. Plan: `docs/M5_PLAN.md` §6, including Kimi K2.5 (OpenRouter, pinned provider) and DeepSeek Flash, with prepaid caps agreed first | |
| M8 Small open model, the 4th in the comparison (optional) | Not started; deferred from M3. Ollama on the Mac mini for development, vLLM on Modal for official runs (cost estimate and spending limit first). Setup: `docs/OLLAMA_MAC_MINI.md` | |

## Where things stand
- **Held-out results** (110 test cases; judge gpt-oss-20b, `rubric@4`; re-graded 2026-10-06):

  | | Task success | Policy violations |
  | --- | --- | --- |
  | Flash-Lite, `test-2` (round 3, paid tier) | **78%** (69–85%) | 0 |
  | gpt-oss-120b, `test-2` | **63%** (53–71%) | 0 |
  | qwen3.8-27b, `test-1` only | 65% (56–73%) | 0 |

  `test-2`: Flash-Lite leads, not significantly. `test-1`: Qwen is the only model without a policy violation (its one was the lowered coupon), but has the lowest task success. Details: README, M6 history.
- **Grading decisions 2026-10-06:** refunds graded per order; a lowered coupon is a task failure, not a policy violation (the 10% stayed within every limit in code). The coupon tool now says to request the customer's amount (not measured).
- **The team runs Flash-Lite in all three roles.** Retire decision 2026-10-05: Qwen out of the shopping role. No further decision after `test-2` (Julian).
- **Eval sets:** dev 43, test 110 (frozen). Runs since `test-1` are labelled round 3.

## Budget
- **Groq:** ≈ $7.52 of the $8 cycle spent, counted from 2026-09-30. The reset date is unknown (Julian: Groq console → Settings → Billing).
- **Gemini:** paid tier since 2026-10-06 14:05 UTC, **capped at $5/month** (Google Cloud). Flash-Lite $0.30 / $2.50 per 1M, no daily cap. ≈ $0.43 recorded so far (up to ≈ $0.59 if `dev-r3` was billed).
- **Modal:** unused.
- Any run costs: give an estimate first.

## Next
1. **The public site:** https://julianreyes.dev/AgentDesk/ (dashboard `/AgentDesk/ops/`), a static snapshot on GitHub Pages. To update: commit, `npm run export:static`, commit `site-data/`, push.
2. **Julian, carried from M6:**
   - edit `CASE_STUDY.md` (drafted; every number has a source note)
   - record the README GIF
   - check the site on a phone (layout, and that the recordings play)
   - decide whether the Approvals page's model-written notes are admin-only
3. **M7 (optional), when Julian starts it:** live chat on the public site; Kimi K2.5 and DeepSeek Flash. No accounts or calls before then.
4. **M8 (optional):** the small open model.

## Open items
- **Measurement gaps:** the coupon-tool sentence isn't measured; Qwen wasn't rerun after round 3; judge score calibration on weak replies.
- **Known weaknesses (documented):** the damage cause is the model's word (gpt-oss, 1 of 12 on dev); gpt-oss's follow-up and timing claims.
- **Config:** Gemini 3.8 Flash's price doubles on 2027-01-01 ($1.50 / $7.50); update `models.json` then. DeepSeek's config is in place, unused until M7.
- **Only for M7:** live chats are in memory; one shared admin token, not a real login.

## How to run
See `README.md`. In short:
```sh
npm install
npm run db:migrate && npm run db:seed
npm run dev
npm run typecheck && npm test
```
The pre-commit hook runs typecheck and tests (`git config core.hooksPath .githooks`). `ADMIN_TOKEN` must be at least 24 characters.
