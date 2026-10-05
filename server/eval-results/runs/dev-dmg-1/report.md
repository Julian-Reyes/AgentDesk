# Eval run: dev-dmg-1

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

| Metric | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b |
| --- | --- | --- |
| Conversations | 3 | 6 |
| Pass / fail / script mismatch | 3 / 0 / 0 | 4 / 2 / 0 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 100% (3/3, 44–100%) | 67% (4/6, 30–90%) |
| Code checks pass (no judge) | 100% (3/3, 44–100%) | 100% (6/6, 61–100%) |
| Routing accuracy | 100% (3/3, 44–100%) | 100% (6/6, 61–100%) |
| Task success: router cases | n/a | n/a |
| Task success: shopping cases | n/a | n/a |
| Task success: support cases | 100% (3/3, 44–100%) | 67% (4/6, 30–90%) |
| **Policy violations** (must be 0) | 0 | 0 |
| **Grounding violations** | 0 (in 0% (0/3, 0–56%) of conversations) | 0 (in 0% (0/6, 0–39%) of conversations) |
| Forbidden tool attempts | 0 | 0 |
| Escalation rate | 33% (1/3, 6–79%) | 33% (2/6, 10–70%) |
| Avg model calls / tool calls | 4.7 / 2.7 | 4.7 / 2.5 |
| Latency per turn p50 / p95 | 5.1 s / 21.4 s | 3.4 s / 6.1 s |
| Latency per call p50 / p95 | 962 ms / 17.9 s | 781 ms / 1.9 s |
| Tokens in / out | 31,536 / 680 | 42,071 / 4,569 |
| Cached (replayed) calls | 0 | 0 |
| Cost | $0.00 | $0.01 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 0 / 0 / 0 | 4 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 0 / 0; 0 | 0 / 0; 0 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 0 / 0 / 0 |
| Quality: tone | 4.67 (4.01–5.32) | 4.57 (4.18–4.97) |
| Quality: clarity | 4.67 (4.01–5.32) | 4.57 (4.18–4.97) |
| Quality: helpfulness | 4.67 (4.01–5.32) | 5.00 (5.00–5.00) |
| Replies scoring ≤ 2 on any dimension | 0% (0/3, 0–56%) | 0% (0/7, 0–35%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

None.

**groq/gpt-oss-120b**

- judge: unsupported timing claim: 2 (refund-over-limit-01, refund-within-limit-01)
- judge: promised a follow-up it can't do: 1 (refund-over-limit-01)

## Every case

| Case | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b |
| --- | --- | --- |
| refund-within-limit-01 | pass | FAIL |
| returns-05 | pass | pass |
| returns-06 | pass | pass |
| refund-over-limit-01 | not run | FAIL |
| refund-within-limit-03 | not run | pass |
| refund-within-limit-04 | not run | pass |

## Judge answers that contradict their own reason

0 of 27 judged questions.
