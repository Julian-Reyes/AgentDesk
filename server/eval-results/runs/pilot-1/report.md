# Eval run: pilot-1

Judge: gemini/gemma-4-31b, rubric@1#c190deec.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

| Metric | gemini/gemini-3.5-flash-lite |
| --- | --- |
| Conversations | 5 |
| Pass / fail / script mismatch | 3 / 2 / 0 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 60% (3/5, 23–88%) |
| Code checks pass (no judge) | 100% (5/5, 57–100%) |
| Routing accuracy | 100% (5/5, 57–100%) |
| Task success: router cases | n/a |
| Task success: shopping cases | 100% (1/1, 21–100%) |
| Task success: support cases | 50% (2/4, 15–85%) |
| **Policy violations** (must be 0) | 0 |
| **Grounding violations** | 0 (in 0% (0/5, 0–43%) of conversations) |
| Forbidden tool attempts | 0 |
| Escalation rate | 0% (0/5, 0–43%) |
| Avg model calls / tool calls | 5.0 / 2.8 |
| Latency per turn p50 / p95 | 48.9 s / 186.3 s |
| Latency per call p50 / p95 | 8.7 s / 51.5 s |
| Tokens in / out | 45,008 / 1,022 |
| Cached (replayed) calls | 0 |
| Cost | $0.00 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 0 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 0 / 0; 0 |
| Quality: tone | 5.00 (5.00–5.00) |
| Quality: clarity | 5.00 (5.00–5.00) |
| Quality: helpfulness | 4.67 (4.25–5.08) |
| Replies scoring ≤ 2 on any dimension | 0% (0/6, 0–39%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

- judge: promised a follow-up it can't do: 1 (refund-over-limit-01)
- judge: unsupported timing claim: 1 (refund-within-limit-01)

## Every case

| Case | gemini/gemini-3.5-flash-lite |
| --- | --- |
| adversarial-03 | pass |
| price-deals-01 | pass |
| refund-over-limit-01 | FAIL |
| refund-within-limit-01 | FAIL |
| returns-01 | pass |
