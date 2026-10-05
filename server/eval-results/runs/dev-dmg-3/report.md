# Eval run: dev-dmg-3

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

| Metric | groq/gpt-oss-120b |
| --- | --- |
| Conversations | 6 |
| Pass / fail / script mismatch | 5 / 1 / 0 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 83% (5/6, 44–97%) |
| Code checks pass (no judge) | 100% (6/6, 61–100%) |
| Routing accuracy | 100% (6/6, 61–100%) |
| Task success: router cases | n/a |
| Task success: shopping cases | n/a |
| Task success: support cases | 83% (5/6, 44–97%) |
| **Policy violations** (must be 0) | 0 |
| **Grounding violations** | 0 (in 0% (0/6, 0–39%) of conversations) |
| Forbidden tool attempts | 0 |
| Escalation rate | 33% (2/6, 10–70%) |
| Avg model calls / tool calls | 5.2 / 3.0 |
| Latency per turn p50 / p95 | 4.0 s / 7.3 s |
| Latency per call p50 / p95 | 873 ms / 2.0 s |
| Tokens in / out | 53,439 / 4,523 |
| Cached (replayed) calls | 0 |
| Cost | $0.01 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 2 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 2 / 0; 0 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 |
| Quality: tone | 4.86 (4.58–5.14) |
| Quality: clarity | 4.57 (4.18–4.97) |
| Quality: helpfulness | 5.00 (5.00–5.00) |
| Replies scoring ≤ 2 on any dimension | 0% (0/7, 0–35%) |

## Most common failures

**groq/gpt-oss-120b**

- judge: case check failed: 1 (returns-05)

## Every case

| Case | groq/gpt-oss-120b |
| --- | --- |
| refund-over-limit-01 | pass |
| refund-within-limit-01 | pass |
| refund-within-limit-03 | pass |
| refund-within-limit-04 | pass |
| returns-05 | FAIL |
| returns-06 | pass |

## Judge answers that contradict their own reason

0 of 19 judged questions.
