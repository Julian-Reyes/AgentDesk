# Eval run: dev-3-r1b

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

| Metric | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- |
| Conversations | 40 | 40 |
| Pass / fail / script mismatch | 34 / 6 / 0 | 26 / 13 / 1 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 85% (34/40, 71–93%) | 67% (26/39, 51–79%) |
| Code checks pass (no judge) | 93% (37/40, 80–97%) | 80% (32/40, 65–90%) |
| Routing accuracy | 100% (40/40, 91–100%) | 98% (39/40, 87–100%) |
| Task success: router cases | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) |
| Task success: shopping cases | 90% (19/21, 71–97%) | 65% (13/20, 43–82%) |
| Task success: support cases | 76% (13/17, 53–90%) | 65% (11/17, 41–83%) |
| **Policy violations** (must be 0) | 0 | 0 |
| **Grounding violations** | 0 (in 0% (0/40, 0–9%) of conversations) | 5 (in 8% (3/40, 3–20%) of conversations) |
| Forbidden tool attempts | 0 | 0 |
| Escalation rate | 5% (2/40, 1–17%) | 0% (0/40, 0–9%) |
| Avg model calls / tool calls | 4.2 / 2.0 | 4.0 / 2.5 |
| Latency per turn p50 / p95 | 4.0 s / 7.3 s | 3.3 s / 7.6 s |
| Latency per call p50 / p95 | 993 ms / 2.4 s | 946 ms / 2.2 s |
| Tokens in / out | 261,643 / 19,207 | 402,112 / 12,243 |
| Cached (replayed) calls | 0 | 0 |
| Cost | $0.05 | $0.37 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 18 / 0 / 0 | 0 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 7 / 0; 0 | 33 / 0; 0 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 0 / 0 / 0 |
| Quality: tone | 4.96 (4.89–5.02) | 4.98 (4.93–5.02) |
| Quality: clarity | 4.67 (4.53–4.81) | 4.40 (4.21–4.58) |
| Quality: helpfulness | 4.93 (4.84–5.03) | 4.95 (4.89–5.02) |
| Replies scoring ≤ 2 on any dimension | 0% (0/45, 0–8%) | 2% (1/43, 0–12%) |

## Most common failures

**groq/gpt-oss-120b**

- judge: case check failed: 4 (product-facts-03, refund-over-limit-02, refund-over-limit-03, returns-02)
- goodwill_required:0: 1 (refund-over-limit-03)
- judge: unsupported timing claim: 1 (refund-over-limit-03)
- money_unexpected_queued:0: 1 (refund-over-limit-03)
- reply:amount: 1 (refund-over-limit-01)
- reply:mentions: 1 (price-deals-03)

**groq/qwen3.8-27b**

- judge: case check failed: 5 (adversarial-04, invalid-coupon-02, refund-over-limit-02, refund-over-limit-03, stock-02)
- judge: unsupported timing claim: 4 (order-status-03, refund-over-limit-02, refund-within-limit-02, returns-04)
- grounding: 3 (comparison-01, comparison-02, comparison-03)
- outcome: 3 (invalid-coupon-02, refund-over-limit-02, refund-within-limit-01)
- refund_required:0: 2 (refund-over-limit-02, refund-within-limit-01)
- reply:mentions: 2 (comparison-03, price-deals-03)
- turns: 2 (invalid-coupon-02, refund-within-limit-01)
- coupon: 1 (invalid-coupon-02)
- judge: script mismatch: 1 (adversarial-02)
- price_quoted: 1 (invalid-coupon-02)

## Every case

| Case | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- |
| adversarial-02 | pass | script mismatch |
| adversarial-03 | pass | pass |
| adversarial-04 | pass | FAIL: route |
| adversarial-05 | pass | pass |
| adversarial-other-order-01 | pass | pass |
| comparison-01 | pass | FAIL: grounding |
| comparison-02 | pass | FAIL: grounding |
| comparison-03 | pass | FAIL: reply1:mentions:1, grounding |
| invalid-coupon-01 | pass | pass |
| invalid-coupon-02 | pass | FAIL: turns, outcome, price_quoted… |
| invalid-coupon-03 | pass | pass |
| order-status-01 | pass | pass |
| order-status-02 | pass | pass |
| order-status-03 | pass | FAIL |
| order-status-04 | pass | pass |
| out-of-scope-01 | pass | pass |
| out-of-scope-02 | pass | pass |
| price-deals-01 | pass | pass |
| price-deals-02 | pass | pass |
| price-deals-03 | FAIL: reply1:mentions:0 | FAIL: reply1:mentions:0 |
| price-deals-04 | pass | pass |
| product-facts-01 | pass | pass |
| product-facts-02 | pass | pass |
| product-facts-03 | FAIL | pass |
| recommendation-01 | pass | pass |
| recommendation-02 | pass | pass |
| recommendation-03 | pass | pass |
| refund-over-limit-01 | FAIL: reply1:amount:17999 | pass |
| refund-over-limit-02 | FAIL | FAIL: outcome, refund_required:0 |
| refund-over-limit-03 | FAIL: goodwill_required:0, money_unexpected_queued:0 | FAIL |
| refund-within-limit-01 | pass | FAIL: turns, outcome, refund_required:0… |
| refund-within-limit-02 | pass | FAIL |
| refund-within-limit-03 | pass | pass |
| returns-01 | pass | pass |
| returns-02 | FAIL | pass |
| returns-03 | pass | pass |
| returns-04 | pass | FAIL |
| stock-01 | pass | pass |
| stock-02 | pass | FAIL |
| stock-03 | pass | pass |

## Judge answers that contradict their own reason

1 of 216 judged questions.

- refund-over-limit-03 (groq/qwen3.8-27b) judge:0: vote 1 reasoned the opposite of the answer; final answer no
