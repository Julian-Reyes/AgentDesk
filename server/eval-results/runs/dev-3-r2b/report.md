# Eval run: dev-3-r2b

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

| Metric | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- |
| Conversations | 30 | 26 |
| Pass / fail / script mismatch | 24 / 6 / 0 | 15 / 11 / 0 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 80% (24/30, 63–90%) | 58% (15/26, 39–74%) |
| Code checks pass (no judge) | 97% (29/30, 83–99%) | 69% (18/26, 50–83%) |
| Routing accuracy | 100% (30/30, 89–100%) | 96% (25/26, 81–99%) |
| Task success: router cases | n/a | n/a |
| Task success: shopping cases | 84% (16/19, 62–94%) | 47% (9/19, 27–68%) |
| Task success: support cases | 73% (8/11, 43–90%) | 86% (6/7, 49–97%) |
| **Policy violations** (must be 0) | 0 | 0 |
| **Grounding violations** | 0 (in 0% (0/30, 0–11%) of conversations) | 12 (in 12% (3/26, 4–29%) of conversations) |
| Forbidden tool attempts | 0 | 1 |
| Escalation rate | 3% (1/30, 1–17%) | 0% (0/26, 0–13%) |
| Avg model calls / tool calls | 4.4 / 2.2 | 4.0 / 2.1 |
| Latency per turn p50 / p95 | 3.6 s / 8.0 s | 2.9 s / 5.9 s |
| Latency per call p50 / p95 | 935 ms / 2.0 s | 810 ms / 1.7 s |
| Tokens in / out | 217,824 / 14,734 | 245,159 / 7,077 |
| Cached (replayed) calls | 0 | 0 |
| Cost | $0.04 | $0.22 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 9 / 0 / 0 | 0 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 4 / 0; 0 | 14 / 0; 1 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 0 / 0 / 0 |
| Quality: tone | 4.97 (4.91–5.03) | 4.76 (4.46–5.06) |
| Quality: clarity | 4.71 (4.55–4.86) | 4.14 (3.73–4.55) |
| Quality: helpfulness | 4.97 (4.91–5.03) | 4.48 (4.03–4.94) |
| Replies scoring ≤ 2 on any dimension | 0% (0/34, 0–10%) | 14% (4/29, 5–31%) |

## Most common failures

**groq/gpt-oss-120b**

- judge: case check failed: 5 (comparison-03, order-status-03, product-facts-03, returns-02, returns-03)
- reply:mentions: 1 (price-deals-03)

**groq/qwen3.8-27b**

- grounding: 3 (comparison-01, comparison-02, comparison-03)
- judge: case check failed: 2 (invalid-coupon-02, product-facts-03)
- judge: unsupported timing claim: 2 (stock-01, stock-02)
- reply:mentions: 2 (price-deals-03, product-facts-02)
- coupon: 1 (invalid-coupon-02)
- judge: promised a follow-up it can't do: 1 (stock-02)
- price_quoted: 1 (invalid-coupon-02)
- price_stated: 1 (invalid-coupon-02)
- recommendation (NO_ACCEPTABLE_NAMED): 1 (recommendation-01)
- route: 1 (invalid-coupon-02)

## Every case

| Case | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- |
| comparison-01 | pass | FAIL: grounding |
| comparison-02 | pass | FAIL: grounding |
| comparison-03 | FAIL | FAIL: grounding |
| invalid-coupon-01 | pass | pass |
| invalid-coupon-02 | pass | FAIL: route, price_quoted, price_stated… |
| invalid-coupon-03 | pass | pass |
| order-status-01 | pass | pass |
| order-status-02 | pass | FAIL: tool_forbidden:get_tracking |
| order-status-03 | FAIL | pass |
| order-status-04 | pass | pass |
| price-deals-01 | pass | pass |
| price-deals-02 | pass | pass |
| price-deals-03 | FAIL: reply1:mentions:0 | FAIL: reply1:mentions:0 |
| price-deals-04 | pass | pass |
| product-facts-01 | pass | pass |
| product-facts-02 | pass | FAIL: reply1:mentions:0, reply1:mentions:1 |
| product-facts-03 | FAIL | FAIL |
| recommendation-01 | pass | FAIL: recommendation |
| recommendation-02 | pass | pass |
| recommendation-03 | pass | pass |
| refund-within-limit-01 | pass | not run |
| refund-within-limit-02 | pass | not run |
| refund-within-limit-03 | pass | not run |
| returns-01 | pass | pass |
| returns-02 | FAIL | pass |
| returns-03 | FAIL | pass |
| returns-04 | pass | not run |
| stock-01 | pass | FAIL |
| stock-02 | pass | FAIL |
| stock-03 | pass | pass |

## Judge answers that contradict their own reason

0 of 145 judged questions.
