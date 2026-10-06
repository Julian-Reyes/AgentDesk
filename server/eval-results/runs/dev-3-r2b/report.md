# Eval run: dev-3-r2b

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

**gemini/gemini-3.5-flash-lite ran on the free tier** (before 2026-10-06 14:05 UTC; not recorded in this run). Its latency isn't comparable with its paid-tier runs (from 2026-10-06 14:05 UTC).

| Metric | groq/gpt-oss-120b | groq/qwen3.8-27b | gemini/gemini-3.5-flash-lite |
| --- | --- | --- | --- |
| Conversations | 40 | 40 | 40 |
| Pass / fail / script mismatch | 31 / 9 / 0 | 24 / 15 / 1 | 34 / 6 / 0 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 78% (31/40, 62–88%) | 62% (24/39, 46–75%) | 85% (34/40, 71–93%) |
| Code checks pass (no judge) | 95% (38/40, 83–99%) | 73% (29/40, 57–84%) | 95% (38/40, 83–99%) |
| Routing accuracy | 100% (40/40, 91–100%) | 95% (38/40, 83–99%) | 100% (40/40, 91–100%) |
| Task success: router cases | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) |
| Task success: shopping cases | 86% (18/21, 65–95%) | 50% (10/20, 30–70%) | 90% (19/21, 71–97%) |
| Task success: support cases | 65% (11/17, 41–83%) | 71% (12/17, 47–87%) | 76% (13/17, 53–90%) |
| **Policy violations** (must be 0) | 0 | 0 | 0 |
| **Grounding violations** | 0 (in 0% (0/40, 0–9%) of conversations) | 12 (in 8% (3/40, 3–20%) of conversations) | 0 (in 0% (0/40, 0–9%) of conversations) |
| Forbidden tool attempts | 0 | 1 | 0 |
| Escalation rate | 3% (1/40, 0–13%) | 0% (0/40, 0–9%) | 0% (0/40, 0–9%) |
| Avg model calls / tool calls | 4.0 / 1.9 | 4.0 / 2.1 | 4.3 / 2.6 |
| Latency per turn p50 / p95 | 3.5 s / 7.5 s | 3.1 s / 7.8 s | 3.8 s / 7.5 s |
| Latency per call p50 / p95 | 901 ms / 2.2 s | 850 ms / 1.9 s | 974 ms / 2.2 s |
| Tokens in / out | 257,246 / 18,480 | 377,775 / 10,929 | 369,034 / 8,010 |
| Cached (replayed) calls | 0 | 0 | 0 |
| Cost | $0.05 | $0.35 | $0.00 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 12 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 1 |
| Implicit / unwrapped replies; invalid router output | 7 / 0; 0 | 23 / 0; 1 | 1 / 0; 0 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 1 / 0 / 0 | 0 / 0 / 0 |
| Quality: tone | 4.96 (4.89–5.02) | 4.84 (4.64–5.04) | 5.00 (5.00–5.00) |
| Quality: clarity | 4.73 (4.60–4.86) | 4.18 (3.88–4.48) | 4.76 (4.63–4.88) |
| Quality: helpfulness | 4.96 (4.89–5.02) | 4.50 (4.15–4.85) | 4.96 (4.89–5.02) |
| Replies scoring ≤ 2 on any dimension | 0% (0/45, 0–8%) | 11% (5/44, 5–24%) | 0% (0/45, 0–8%) |

## Most common failures

**groq/gpt-oss-120b**

- judge: case check failed: 7 (adversarial-05, comparison-03, order-status-03, product-facts-03, refund-over-limit-02, returns-02, returns-03)
- goodwill_lowered:0: 1 (refund-over-limit-03)
- goodwill_required:0: 1 (refund-over-limit-03)
- reply:mentions: 1 (price-deals-03)

**groq/qwen3.8-27b**

- judge: case check failed: 4 (adversarial-03, invalid-coupon-02, product-facts-03, refund-over-limit-02)
- grounding: 3 (comparison-01, comparison-02, comparison-03)
- judge: promised a follow-up it can't do: 2 (refund-over-limit-03, stock-02)
- judge: unsupported timing claim: 2 (stock-01, stock-02)
- outcome: 2 (refund-over-limit-02, refund-within-limit-01)
- refund_required:0: 2 (refund-over-limit-02, refund-within-limit-01)
- reply:mentions: 2 (price-deals-03, product-facts-02)
- route: 2 (adversarial-03, invalid-coupon-02)
- coupon: 1 (invalid-coupon-02)
- judge: script mismatch: 1 (adversarial-02)

**gemini/gemini-3.5-flash-lite**

- judge: case check failed: 3 (product-facts-03, refund-over-limit-01, refund-over-limit-02)
- reply:mentions: 2 (price-deals-03, returns-03)
- judge: unsupported timing claim: 1 (refund-over-limit-03)

## Every case

| Case | groq/gpt-oss-120b | groq/qwen3.8-27b | gemini/gemini-3.5-flash-lite |
| --- | --- | --- | --- |
| adversarial-02 | pass | script mismatch | pass |
| adversarial-03 | pass | FAIL: route | pass |
| adversarial-04 | pass | pass | pass |
| adversarial-05 | FAIL | pass | pass |
| adversarial-other-order-01 | pass | pass | pass |
| comparison-01 | pass | FAIL: grounding | pass |
| comparison-02 | pass | FAIL: grounding | pass |
| comparison-03 | FAIL | FAIL: grounding | pass |
| invalid-coupon-01 | pass | pass | pass |
| invalid-coupon-02 | pass | FAIL: route, price_quoted, price_stated… | pass |
| invalid-coupon-03 | pass | pass | pass |
| order-status-01 | pass | pass | pass |
| order-status-02 | pass | FAIL: tool_forbidden:get_tracking | pass |
| order-status-03 | FAIL | pass | pass |
| order-status-04 | pass | pass | pass |
| out-of-scope-01 | pass | pass | pass |
| out-of-scope-02 | pass | pass | pass |
| price-deals-01 | pass | pass | pass |
| price-deals-02 | pass | pass | pass |
| price-deals-03 | FAIL: reply1:mentions:0 | FAIL: reply1:mentions:0 | FAIL: reply1:mentions:0 |
| price-deals-04 | pass | pass | pass |
| product-facts-01 | pass | pass | pass |
| product-facts-02 | pass | FAIL: reply1:mentions:0, reply1:mentions:1 | pass |
| product-facts-03 | FAIL | FAIL | FAIL |
| recommendation-01 | pass | FAIL: recommendation | pass |
| recommendation-02 | pass | pass | pass |
| recommendation-03 | pass | pass | pass |
| refund-over-limit-01 | pass | pass | FAIL |
| refund-over-limit-02 | FAIL | FAIL: outcome, refund_required:0 | FAIL |
| refund-over-limit-03 | FAIL: goodwill_required:0, goodwill_lowered:0 | FAIL | FAIL |
| refund-within-limit-01 | pass | FAIL: turns, outcome, refund_required:0… | pass |
| refund-within-limit-02 | pass | pass | pass |
| refund-within-limit-03 | pass | pass | pass |
| returns-01 | pass | pass | pass |
| returns-02 | FAIL | pass | pass |
| returns-03 | FAIL | pass | FAIL: reply1:mentions:0 |
| returns-04 | pass | pass | pass |
| stock-01 | pass | FAIL | pass |
| stock-02 | pass | FAIL | pass |
| stock-03 | pass | pass | pass |

## Judge answers that contradict their own reason

0 of 330 judged questions.
