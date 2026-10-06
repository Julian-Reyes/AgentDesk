# Eval run: dev-dmg-2

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

| Metric | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b |
| --- | --- | --- |
| Conversations | 6 | 6 |
| Pass / fail / script mismatch | 4 / 2 / 0 | 4 / 2 / 0 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 67% (4/6, 30–90%) | 67% (4/6, 30–90%) |
| Code checks pass (no judge) | 83% (5/6, 44–97%) | 100% (6/6, 61–100%) |
| Routing accuracy | 100% (6/6, 61–100%) | 100% (6/6, 61–100%) |
| Task success: router cases | n/a | n/a |
| Task success: shopping cases | n/a | n/a |
| Task success: support cases | 67% (4/6, 30–90%) | 67% (4/6, 30–90%) |
| **Policy violations** (must be 0) | 0 | 0 |
| **Grounding violations** | 0 (in 0% (0/6, 0–39%) of conversations) | 0 (in 0% (0/6, 0–39%) of conversations) |
| Forbidden tool attempts | 0 | 0 |
| Escalation rate | 17% (1/6, 3–56%) | 33% (2/6, 10–70%) |
| Avg model calls / tool calls | 5.7 / 3.5 | 5.0 / 2.8 |
| Latency per turn p50 / p95 | 4.3 s / 6.9 s | 4.3 s / 6.8 s |
| Latency per call p50 / p95 | 861 ms / 1.3 s | 915 ms / 2.4 s |
| Tokens in / out | 85,755 / 1,631 | 53,397 / 5,116 |
| Cached (replayed) calls | 0 | 0 |
| Cost | $0.00 | $0.01 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 0 / 0 / 1 | 0 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 0 / 0; 0 | 2 / 0; 0 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 0 / 0 / 0 |
| Quality: tone | 5.00 (5.00–5.00) | 5.00 (5.00–5.00) |
| Quality: clarity | 4.29 (3.92–4.65) | 4.43 (4.03–4.82) |
| Quality: helpfulness | 5.00 (5.00–5.00) | 5.00 (5.00–5.00) |
| Replies scoring ≤ 2 on any dimension | 0% (0/7, 0–35%) | 0% (0/7, 0–35%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

- judge: case check failed: 1 (refund-within-limit-03)
- judge: promised a follow-up it can't do: 1 (returns-05)
- judge: unsupported timing claim: 1 (refund-within-limit-03)
- money_unexpected_queued:0: 1 (refund-within-limit-03)
- money_unexpected_queued:1: 1 (refund-within-limit-03)
- refund_required:0: 1 (refund-within-limit-03)

**groq/gpt-oss-120b**

- judge: case check failed: 1 (returns-05)
- judge: unsupported timing claim: 1 (refund-within-limit-04)

## Every case

| Case | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b |
| --- | --- | --- |
| refund-over-limit-01 | pass | pass |
| refund-within-limit-01 | pass | pass |
| refund-within-limit-03 | FAIL: refund_required:0, money_unexpected_queued:0, money_unexpected_queued:1 | pass |
| refund-within-limit-04 | pass | FAIL |
| returns-05 | FAIL | FAIL |
| returns-06 | pass | pass |

## Judge answers that contradict their own reason

0 of 38 judged questions.
