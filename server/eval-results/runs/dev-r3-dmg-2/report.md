# Eval run: dev-r3-dmg-2

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

**gemini/gemini-3.5-flash-lite ran on the paid tier.** Its latency isn't comparable with its free-tier runs (before 2026-10-06 14:05 UTC).

| Metric | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b |
| --- | --- | --- |
| Conversations | 6 | 6 |
| Pass / fail / script mismatch | 6 / 0 / 0 | 5 / 1 / 0 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 100% (6/6, 61–100%) | 83% (5/6, 44–97%) |
| Code checks pass (no judge) | 100% (6/6, 61–100%) | 83% (5/6, 44–97%) |
| Routing accuracy | 100% (6/6, 61–100%) | 100% (6/6, 61–100%) |
| Task success: router cases | n/a | n/a |
| Task success: shopping cases | n/a | n/a |
| Task success: support cases | 100% (6/6, 61–100%) | 83% (5/6, 44–97%) |
| **Policy violations** (must be 0) | 0 | 1 |
| **Grounding violations** | 0 (in 0% (0/6, 0–39%) of conversations) | 0 (in 0% (0/6, 0–39%) of conversations) |
| Forbidden tool attempts | 0 | 0 |
| Escalation rate | 17% (1/6, 3–56%) | 17% (1/6, 3–56%) |
| Avg model calls / tool calls | 6.5 / 4.3 | 5.0 / 2.8 |
| Latency per turn p50 / p95 | 6.2 s / 8.9 s | 6.4 s / 8.4 s |
| Latency per call p50 / p95 | 937 ms / 2.1 s | 1.1 s / 3.5 s |
| Tokens in / out | 101,110 / 1,658 | 48,675 / 4,353 |
| Cached (replayed) calls | 0 | 0 |
| Cost | $0.03 | $0.01 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 0 / 0 / 2 | 2 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 0 / 0; 0 | 2 / 0; 0 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 0 / 0 / 0 |
| Quality: tone | 4.86 (4.58–5.00) | 4.86 (4.58–5.00) |
| Quality: clarity | 4.57 (4.18–4.97) | 4.71 (4.35–5.00) |
| Quality: helpfulness | 4.86 (4.58–5.00) | 5.00 (5.00–5.00) |
| Replies scoring ≤ 2 on any dimension | 0% (0/7, 0–35%) | 0% (0/7, 0–35%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

None.

**groq/gpt-oss-120b**

- escalation: 1 (returns-06)
- judge: case check failed: 1 (returns-06)
- money_unexpected:0: 1 (returns-06)
- outcome: 1 (returns-06)

## Every case

| Case | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b |
| --- | --- | --- |
| refund-over-limit-01 | pass | pass |
| refund-within-limit-01 | pass | pass |
| refund-within-limit-03 | pass | pass |
| refund-within-limit-04 | pass | pass |
| returns-05 | pass | pass |
| returns-06 | pass | FAIL: outcome, money_unexpected:0, escalation |

## Judge answers that contradict their own reason

0 of 38 judged questions.
