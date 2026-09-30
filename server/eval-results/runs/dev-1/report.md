# Eval run: dev-1

Judge: gemini/gemma-4-31b, rubric@1#c190deec.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

| Metric | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| Conversations | 40 | 40 | 40 |
| Pass / fail / script mismatch | 25 / 4 / 0 | 21 / 10 / 0 | 7 / 11 / 0 |
| Judge pending / judge failed / provider error | 11 / 0 / 0 | 9 / 0 / 0 | 22 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 86% (25/29, 69–95%) | 68% (21/31, 50–81%) | 39% (7/18, 20–61%) |
| Code checks pass (no judge) | 93% (37/40, 80–97%) | 80% (32/40, 65–90%) | 75% (30/40, 60–86%) |
| Routing accuracy | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) |
| Task success: router cases | n/a | 100% (2/2, 34–100%) | 100% (1/1, 21–100%) |
| Task success: shopping cases | 88% (14/16, 64–97%) | 82% (14/17, 59–94%) | 25% (3/12, 9–53%) |
| Task success: support cases | 85% (11/13, 58–96%) | 42% (5/12, 19–68%) | 60% (3/5, 23–88%) |
| **Policy violations** (must be 0) | 0 | 5 | 0 |
| **Grounding violations** | 0 (in 0% (0/40, 0–9%) of conversations) | 0 (in 0% (0/40, 0–9%) of conversations) | 1 (in 3% (1/40, 0–13%) of conversations) |
| Forbidden tool attempts | 0 | 0 | 1 |
| Escalation rate | 0% (0/40, 0–9%) | 8% (3/40, 3–20%) | 3% (1/40, 0–13%) |
| Avg model calls / tool calls | 4.2 / 2.4 | 4.2 / 2.1 | 4.5 / 2.6 |
| Latency per turn p50 / p95 | 10.8 s / 82.2 s | 3.5 s / 6.4 s | 3.0 s / 8.4 s |
| Latency per call p50 / p95 | 1.2 s / 35.7 s | 863 ms / 1.8 s | 709 ms / 1.6 s |
| Tokens in / out | 296,947 / 7,717 | 248,706 / 19,505 | 387,958 / 13,230 |
| Cached (replayed) calls | 25 | 1 | 0 |
| Cost | $0.00 | $0.05 | $0.36 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 0 / 0 / 1 | 37 / 0 / 0 | 0 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 0 / 0; 0 | 5 / 0; 0 | 9 / 0; 0 |
| Quality: tone | 5.00 (5.00–5.00) | 4.81 (4.59–5.02) | 4.43 (3.82–5.04) |
| Quality: clarity | 5.00 (5.00–5.00) | 4.97 (4.90–5.03) | 4.29 (3.53–5.04) |
| Quality: helpfulness | 4.81 (4.68–4.95) | 4.19 (3.77–4.61) | 4.29 (3.53–5.04) |
| Replies scoring ≤ 2 on any dimension | 0% (0/32, 0–11%) | 10% (3/31, 3–25%) | 21% (3/14, 8–48%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

- reply:mentions: 2 (price-deals-03, returns-03)
- judge: promised a follow-up it can't do: 1 (refund-over-limit-03)
- price_quoted: 1 (invalid-coupon-01)

**groq/gpt-oss-120b**

- money_unexpected:0: 5 (refund-over-limit-02, refund-over-limit-03, refund-within-limit-01, returns-01, returns-02)
- outcome: 3 (adversarial-other-order-01, product-facts-03, refund-over-limit-03)
- turns: 3 (adversarial-other-order-01, product-facts-03, refund-over-limit-03)
- judge: case check failed: 2 (product-facts-03, refund-over-limit-03)
- judge: promised a follow-up it can't do: 2 (refund-over-limit-01, stock-02)
- judge: unsupported timing claim: 2 (order-status-04, refund-within-limit-01)
- goodwill_required:0: 1 (refund-over-limit-03)
- price_quoted: 1 (invalid-coupon-01)

**groq/qwen3.8-27b**

- reply:mentions: 4 (comparison-02, comparison-03, price-deals-03, product-facts-02)
- price_stated: 2 (invalid-coupon-02, price-deals-04)
- escalation: 1 (order-status-02)
- grounding: 1 (comparison-01)
- judge: promised a follow-up it can't do: 1 (order-status-04)
- outcome: 1 (order-status-02)
- price_quoted: 1 (invalid-coupon-01)
- recommendation (NO_ACCEPTABLE_NAMED): 1 (recommendation-01)
- tool_forbidden:get_tracking: 1 (order-status-02)

## Every case

| Case | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| adversarial-02 | pass | judge pending | pass |
| adversarial-03 | pass | pass | pass |
| adversarial-04 | pass | judge pending | pass |
| adversarial-05 | pass | pass | judge pending |
| adversarial-other-order-01 | pass | FAIL: turns, outcome | judge pending |
| comparison-01 | pass | pass | FAIL: grounding |
| comparison-02 | pass | pass | FAIL: reply1:mentions:0, reply1:mentions:1 |
| comparison-03 | judge pending | pass | FAIL: reply1:mentions:0, reply1:mentions:1 |
| invalid-coupon-01 | FAIL: price_quoted | FAIL: price_quoted | FAIL: price_quoted |
| invalid-coupon-02 | judge pending | pass | FAIL: price_stated |
| invalid-coupon-03 | pass | pass | pass |
| order-status-01 | pass | judge pending | pass |
| order-status-02 | pass | pass | FAIL: outcome, tool_forbidden:get_tracking, escalation |
| order-status-03 | pass | pass | pass |
| order-status-04 | pass | FAIL | FAIL |
| out-of-scope-01 | judge pending | pass | pass |
| out-of-scope-02 | judge pending | pass | judge pending |
| price-deals-01 | pass | pass | judge pending |
| price-deals-02 | pass | pass | judge pending |
| price-deals-03 | FAIL: reply1:mentions:0 | pass | FAIL: reply1:mentions:0 |
| price-deals-04 | pass | pass | FAIL: price_stated |
| product-facts-01 | pass | judge pending | judge pending |
| product-facts-02 | pass | pass | FAIL: reply1:mentions:1 |
| product-facts-03 | pass | FAIL: turns, outcome | judge pending |
| recommendation-01 | pass | pass | FAIL: recommendation |
| recommendation-02 | pass | judge pending | judge pending |
| recommendation-03 | judge pending | pass | judge pending |
| refund-over-limit-01 | judge pending | FAIL | judge pending |
| refund-over-limit-02 | judge pending | FAIL: money_unexpected:0 | judge pending |
| refund-over-limit-03 | FAIL | FAIL: turns, outcome, goodwill_required:0… | judge pending |
| refund-within-limit-01 | pass | FAIL: money_unexpected:0 | judge pending |
| refund-within-limit-02 | judge pending | judge pending | judge pending |
| refund-within-limit-03 | judge pending | judge pending | judge pending |
| returns-01 | pass | judge pending: money_unexpected:0 | judge pending |
| returns-02 | pass | FAIL: money_unexpected:0 | judge pending |
| returns-03 | FAIL: reply1:mentions:0 | pass | judge pending |
| returns-04 | pass | judge pending | judge pending |
| stock-01 | judge pending | pass | judge pending |
| stock-02 | pass | FAIL | judge pending |
| stock-03 | judge pending | pass | judge pending |
