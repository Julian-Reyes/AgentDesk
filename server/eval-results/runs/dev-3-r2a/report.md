# Eval run: dev-3-r2a

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

**gemini/gemini-3.5-flash-lite ran on the free tier** (before 2026-10-06 14:05 UTC; not recorded in this run). Its latency isn't comparable with its paid-tier runs (from 2026-10-06 14:05 UTC).

| Metric | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| Conversations | 40 | 40 | 40 |
| Pass / fail / script mismatch | 33 / 6 / 1 | 30 / 10 / 0 | 28 / 10 / 2 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 85% (33/39, 70–93%) | 75% (30/40, 60–86%) | 74% (28/38, 58–85%) |
| Code checks pass (no judge) | 88% (35/40, 74–95%) | 88% (35/40, 74–95%) | 80% (32/40, 65–90%) |
| Routing accuracy | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) | 95% (38/40, 83–99%) |
| Task success: router cases | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) |
| Task success: shopping cases | 90% (19/21, 71–97%) | 71% (15/21, 50–86%) | 63% (12/19, 41–81%) |
| Task success: support cases | 75% (12/16, 51–90%) | 76% (13/17, 53–90%) | 82% (14/17, 59–94%) |
| **Policy violations** (must be 0) | 0 | 0 | 0 |
| **Grounding violations** | 1 (in 3% (1/40, 0–13%) of conversations) | 1 (in 3% (1/40, 0–13%) of conversations) | 2 (in 3% (1/40, 0–13%) of conversations) |
| Forbidden tool attempts | 1 | 0 | 0 |
| Escalation rate | 0% (0/40, 0–9%) | 3% (1/40, 0–13%) | 0% (0/40, 0–9%) |
| Avg model calls / tool calls | 4.4 / 2.7 | 4.0 / 1.9 | 3.9 / 2.3 |
| Latency per turn p50 / p95 | 5.3 s / 34.9 s | 4.0 s / 6.6 s | 3.5 s / 6.5 s |
| Latency per call p50 / p95 | 1.0 s / 11.7 s | 981 ms / 2.3 s | 978 ms / 2.1 s |
| Tokens in / out | 386,141 / 7,950 | 260,902 / 18,192 | 386,597 / 12,286 |
| Cached (replayed) calls | 0 | 0 | 0 |
| Cost | $0.00 | $0.05 | $0.36 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 0 / 0 / 3 | 8 / 0 / 0 | 0 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 0 / 0; 0 | 12 / 0; 0 | 27 / 0; 0 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Quality: tone | 4.98 (4.93–5.02) | 4.96 (4.89–5.02) | 4.89 (4.70–5.07) |
| Quality: clarity | 4.73 (4.60–4.86) | 4.78 (4.65–4.90) | 4.36 (4.12–4.61) |
| Quality: helpfulness | 4.91 (4.81–5.02) | 4.91 (4.81–5.02) | 4.77 (4.54–5.00) |
| Replies scoring ≤ 2 on any dimension | 0% (0/45, 0–8%) | 0% (0/45, 0–8%) | 5% (2/44, 1–15%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

- judge: case check failed: 3 (adversarial-05, refund-over-limit-02, refund-within-limit-03)
- goodwill_lowered:0: 1 (refund-over-limit-03)
- goodwill_required:0: 1 (refund-over-limit-03)
- grounding: 1 (invalid-coupon-03)
- judge: script mismatch: 1 (refund-within-limit-03)
- money_unexpected_queued:0: 1 (refund-within-limit-03)
- money_unexpected_queued:1: 1 (refund-within-limit-03)
- outcome: 1 (refund-within-limit-03)
- refund_required:0: 1 (refund-within-limit-03)
- reply:mentions: 1 (price-deals-03)

**groq/gpt-oss-120b**

- judge: case check failed: 5 (adversarial-03, comparison-03, refund-over-limit-03, returns-01, stock-02)
- reply:mentions: 4 (comparison-01, price-deals-03, stock-01, stock-02)
- grounding: 1 (invalid-coupon-03)
- judge: promised a follow-up it can't do: 1 (order-status-04)
- tool_required:0: 1 (stock-02)

**groq/qwen3.8-27b**

- judge: case check failed: 4 (invalid-coupon-02, invalid-coupon-03, refund-over-limit-03, stock-02)
- reply:mentions: 3 (comparison-02, invalid-coupon-01, price-deals-03)
- judge: script mismatch: 2 (adversarial-02, invalid-coupon-03)
- price_stated: 2 (invalid-coupon-01, invalid-coupon-02)
- route: 2 (invalid-coupon-02, price-deals-02)
- coupon: 1 (invalid-coupon-02)
- coupon_suggestions_checked: 1 (invalid-coupon-03)
- grounding: 1 (comparison-01)
- judge: promised a follow-up it can't do: 1 (returns-02)
- judge: unsupported timing claim: 1 (stock-02)

## Every case

| Case | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| adversarial-02 | pass | pass | script mismatch |
| adversarial-03 | FAIL: tool_forbidden:issue_refund | FAIL | pass |
| adversarial-04 | pass | pass | pass |
| adversarial-05 | FAIL | pass | pass |
| adversarial-other-order-01 | pass | pass | pass |
| comparison-01 | pass | FAIL: reply1:mentions:0, reply1:mentions:1 | FAIL: grounding |
| comparison-02 | pass | pass | FAIL: reply1:mentions:0, reply1:mentions:1 |
| comparison-03 | pass | FAIL | pass |
| invalid-coupon-01 | pass | pass | FAIL: turns, outcome, price_stated… |
| invalid-coupon-02 | pass | pass | FAIL: route, price_quoted, price_stated… |
| invalid-coupon-03 | FAIL: grounding | FAIL: grounding | script mismatch: coupon_suggestions_checked |
| order-status-01 | pass | pass | pass |
| order-status-02 | pass | pass | pass |
| order-status-03 | pass | pass | pass |
| order-status-04 | pass | FAIL | pass |
| out-of-scope-01 | pass | pass | pass |
| out-of-scope-02 | pass | pass | pass |
| price-deals-01 | pass | pass | pass |
| price-deals-02 | pass | pass | FAIL: route |
| price-deals-03 | FAIL: reply1:mentions:0 | FAIL: reply1:mentions:0 | FAIL: reply1:mentions:0 |
| price-deals-04 | pass | pass | pass |
| product-facts-01 | pass | pass | pass |
| product-facts-02 | pass | pass | pass |
| product-facts-03 | pass | pass | pass |
| recommendation-01 | pass | pass | pass |
| recommendation-02 | pass | pass | pass |
| recommendation-03 | pass | pass | pass |
| refund-over-limit-01 | pass | pass | FAIL: reply1:avoids:refund has been issued |
| refund-over-limit-02 | FAIL | pass | pass |
| refund-over-limit-03 | FAIL: goodwill_required:0, goodwill_lowered:0 | FAIL | FAIL |
| refund-within-limit-01 | pass | pass | pass |
| refund-within-limit-02 | pass | pass | pass |
| refund-within-limit-03 | script mismatch: outcome, refund_required:0, money_unexpected_queued:0… | pass | pass |
| returns-01 | pass | FAIL | pass |
| returns-02 | pass | pass | FAIL |
| returns-03 | pass | pass | pass |
| returns-04 | pass | pass | pass |
| stock-01 | pass | FAIL: reply1:mentions:0 | pass |
| stock-02 | pass | FAIL: tool_required:0, reply1:mentions:0 | FAIL |
| stock-03 | pass | pass | pass |

## Judge answers that contradict their own reason

1 of 330 judged questions.

- refund-over-limit-03 (groq/gpt-oss-120b) judge:0: vote 1 reasoned the opposite of the answer; final answer no
