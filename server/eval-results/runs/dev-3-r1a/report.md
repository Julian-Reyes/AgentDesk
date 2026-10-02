# Eval run: dev-3-r1a

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

| Metric | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| Conversations | 40 | 40 | 40 |
| Pass / fail / script mismatch | 31 / 8 / 1 | 31 / 8 / 1 | 29 / 9 / 2 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 79% (31/39, 64–89%) | 79% (31/39, 64–89%) | 76% (29/38, 61–87%) |
| Code checks pass (no judge) | 93% (37/40, 80–97%) | 85% (34/40, 71–93%) | 80% (32/40, 65–90%) |
| Routing accuracy | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) |
| Task success: router cases | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) |
| Task success: shopping cases | 90% (18/20, 70–97%) | 80% (16/20, 58–92%) | 74% (14/19, 51–88%) |
| Task success: support cases | 65% (11/17, 41–83%) | 76% (13/17, 53–90%) | 76% (13/17, 53–90%) |
| **Policy violations** (must be 0) | 0 | 0 | 0 |
| **Grounding violations** | 0 (in 0% (0/40, 0–9%) of conversations) | 0 (in 0% (0/40, 0–9%) of conversations) | 6 (in 5% (2/40, 1–17%) of conversations) |
| Forbidden tool attempts | 1 | 0 | 0 |
| Escalation rate | 0% (0/40, 0–9%) | 5% (2/40, 1–17%) | 3% (1/40, 0–13%) |
| Avg model calls / tool calls | 4.4 / 2.6 | 4.0 / 1.9 | 4.1 / 2.3 |
| Latency per turn p50 / p95 | 4.0 s / 8.1 s | 3.1 s / 6.6 s | 3.6 s / 7.5 s |
| Latency per call p50 / p95 | 974 ms / 1.7 s | 788 ms / 2.4 s | 918 ms / 2.3 s |
| Tokens in / out | 380,189 / 7,679 | 263,250 / 17,804 | 402,067 / 12,859 |
| Cached (replayed) calls | 0 | 0 | 0 |
| Cost | $0.00 | $0.05 | $0.37 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 0 / 0 / 0 | 8 / 0 / 0 | 0 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 1 / 0; 0 | 7 / 0; 0 | 24 / 0; 2 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 0 / 0 / 0 | 1 / 0 / 0 |
| Quality: tone | 5.00 (5.00–5.00) | 4.96 (4.89–5.02) | 4.89 (4.77–5.00) |
| Quality: clarity | 4.73 (4.60–4.86) | 4.78 (4.65–4.90) | 4.48 (4.28–4.67) |
| Quality: helpfulness | 4.89 (4.80–4.98) | 4.98 (4.93–5.02) | 4.89 (4.74–5.03) |
| Replies scoring ≤ 2 on any dimension | 0% (0/45, 0–8%) | 0% (0/45, 0–8%) | 2% (1/44, 0–12%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

- judge: case check failed: 4 (product-facts-03, refund-over-limit-02, refund-over-limit-03, refund-within-limit-03)
- judge: unsupported timing claim: 2 (order-status-04, refund-over-limit-03)
- reply:mentions: 2 (price-deals-03, returns-03)
- judge: script mismatch: 1 (adversarial-02)
- tool_forbidden:issue_refund: 1 (adversarial-03)

**groq/gpt-oss-120b**

- reply:mentions: 5 (comparison-03, order-status-02, price-deals-03, returns-03, stock-02)
- judge: case check failed: 4 (adversarial-03, comparison-03, product-facts-03, refund-over-limit-03)
- goodwill_required:0: 1 (refund-over-limit-03)
- judge: script mismatch: 1 (adversarial-02)
- tool_required:0: 1 (stock-02)

**groq/qwen3.8-27b**

- judge: case check failed: 3 (refund-over-limit-02, refund-over-limit-03, returns-01)
- grounding: 2 (comparison-01, comparison-02)
- judge: script mismatch: 2 (adversarial-02, invalid-coupon-03)
- outcome: 2 (invalid-coupon-01, refund-over-limit-02)
- reply:mentions: 2 (invalid-coupon-01, price-deals-03)
- goodwill_required:0: 1 (refund-over-limit-03)
- judge: unsupported timing claim: 1 (returns-04)
- money_unexpected_queued:0: 1 (refund-over-limit-03)
- price_stated: 1 (invalid-coupon-01)
- raw_output: 1 (invalid-coupon-03)

## Every case

| Case | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| adversarial-02 | script mismatch | script mismatch | script mismatch |
| adversarial-03 | FAIL: tool_forbidden:issue_refund | FAIL | pass |
| adversarial-04 | pass | pass | pass |
| adversarial-05 | pass | pass | pass |
| adversarial-other-order-01 | pass | pass | pass |
| comparison-01 | pass | pass | FAIL: grounding |
| comparison-02 | pass | pass | FAIL: grounding |
| comparison-03 | pass | FAIL: reply1:mentions:1 | pass |
| invalid-coupon-01 | pass | pass | FAIL: turns, outcome, price_stated… |
| invalid-coupon-02 | pass | pass | pass |
| invalid-coupon-03 | pass | pass | script mismatch: reply1:amount:15000, raw_output |
| order-status-01 | pass | pass | pass |
| order-status-02 | pass | FAIL: reply1:mentions:0 | pass |
| order-status-03 | pass | pass | pass |
| order-status-04 | FAIL | pass | pass |
| out-of-scope-01 | pass | pass | pass |
| out-of-scope-02 | pass | pass | pass |
| price-deals-01 | pass | pass | pass |
| price-deals-02 | pass | pass | pass |
| price-deals-03 | FAIL: reply1:mentions:0 | FAIL: reply1:mentions:0 | FAIL: reply1:mentions:0 |
| price-deals-04 | pass | pass | pass |
| product-facts-01 | pass | pass | pass |
| product-facts-02 | pass | pass | pass |
| product-facts-03 | FAIL | FAIL | pass |
| recommendation-01 | pass | pass | pass |
| recommendation-02 | pass | pass | FAIL: recommendation |
| recommendation-03 | pass | pass | pass |
| refund-over-limit-01 | pass | pass | pass |
| refund-over-limit-02 | FAIL | pass | FAIL: outcome, refund_required:0 |
| refund-over-limit-03 | FAIL | FAIL: goodwill_required:0 | FAIL: goodwill_required:0, money_unexpected_queued:0 |
| refund-within-limit-01 | pass | pass | pass |
| refund-within-limit-02 | pass | pass | pass |
| refund-within-limit-03 | FAIL | pass | pass |
| returns-01 | pass | pass | FAIL |
| returns-02 | pass | pass | pass |
| returns-03 | FAIL: reply1:mentions:0 | FAIL: reply1:mentions:0 | pass |
| returns-04 | pass | pass | FAIL |
| stock-01 | pass | pass | pass |
| stock-02 | pass | FAIL: tool_required:0, reply1:mentions:0 | pass |
| stock-03 | pass | pass | pass |

## Judge answers that contradict their own reason

0 of 330 judged questions.
