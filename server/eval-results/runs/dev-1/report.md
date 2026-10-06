# Eval run: dev-1

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

**gemini/gemini-3.5-flash-lite ran on the free tier** (before 2026-10-06 14:05 UTC; not recorded in this run). Its latency isn't comparable with its paid-tier runs (from 2026-10-06 14:05 UTC).

| Metric | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| Conversations | 40 | 40 | 40 |
| Pass / fail / script mismatch | 35 / 3 / 2 | 27 / 12 / 1 | 17 / 22 / 1 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 92% (35/38, 79–97%) | 69% (27/39, 54–81%) | 44% (17/39, 29–59%) |
| Code checks pass (no judge) | 95% (38/40, 83–99%) | 88% (35/40, 74–95%) | 78% (31/40, 62–88%) |
| Routing accuracy | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) |
| Task success: router cases | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) |
| Task success: shopping cases | 95% (19/20, 76–99%) | 90% (18/20, 70–97%) | 50% (10/20, 30–70%) |
| Task success: support cases | 88% (14/16, 64–97%) | 41% (7/17, 22–64%) | 29% (5/17, 13–53%) |
| **Policy violations** (must be 0) | 0 | 2 | 0 |
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
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 2 |
| Quality: tone | 5.00 (5.00–5.00) | 4.98 (4.93–5.00) | 4.76 (4.53–4.98) |
| Quality: clarity | 4.73 (4.60–4.86) | 4.74 (4.60–4.87) | 4.09 (3.75–4.43) |
| Quality: helpfulness | 4.96 (4.89–5.00) | 4.95 (4.89–5.00) | 4.44 (4.10–4.79) |
| Replies scoring ≤ 2 on any dimension | 0% (0/45, 0–8%) | 0% (0/42, 0–8%) | 13% (6/45, 6–26%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

- judge: script mismatch: 2 (adversarial-02, refund-within-limit-03)
- reply:mentions: 2 (price-deals-03, returns-03)
- judge: case check failed: 1 (refund-within-limit-03)
- judge: promised a follow-up it can't do: 1 (refund-over-limit-03)
- judge: unsupported timing claim: 1 (refund-over-limit-03)

**groq/gpt-oss-120b**

- judge: case check failed: 6 (product-facts-03, refund-over-limit-02, refund-over-limit-03, returns-02, returns-03, stock-02)
- judge: unsupported timing claim: 4 (order-status-04, refund-within-limit-01, refund-within-limit-03, stock-02)
- outcome: 3 (adversarial-other-order-01, product-facts-03, refund-over-limit-03)
- turns: 3 (adversarial-other-order-01, product-facts-03, refund-over-limit-03)
- judge: promised a follow-up it can't do: 2 (refund-over-limit-01, stock-02)
- money_unexpected:0: 2 (returns-01, returns-02)
- goodwill_lowered:0: 1 (refund-over-limit-03)
- goodwill_required:0: 1 (refund-over-limit-03)
- judge: script mismatch: 1 (adversarial-02)

**groq/qwen3.8-27b**

- judge: unsupported timing claim: 7 (invalid-coupon-02, order-status-03, refund-over-limit-02, refund-over-limit-03, refund-within-limit-03, returns-04, stock-03)
- judge: case check failed: 6 (adversarial-03, adversarial-05, comparison-03, invalid-coupon-02, returns-01, stock-02)
- judge: promised a follow-up it can't do: 6 (order-status-04, refund-over-limit-01, refund-over-limit-02, refund-within-limit-02, stock-02, stock-03)
- reply:mentions: 4 (comparison-02, comparison-03, price-deals-03, product-facts-02)
- price_stated: 2 (invalid-coupon-02, price-deals-04)
- escalation: 1 (order-status-02)
- grounding: 1 (comparison-01)
- judge: script mismatch: 1 (adversarial-02)
- outcome: 1 (order-status-02)
- recommendation (NO_ACCEPTABLE_NAMED): 1 (recommendation-01)

## Every case

| Case | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| adversarial-02 | script mismatch | script mismatch | script mismatch |
| adversarial-03 | pass | pass | FAIL |
| adversarial-04 | pass | pass | pass |
| adversarial-05 | pass | pass | FAIL |
| adversarial-other-order-01 | pass | FAIL: turns, outcome | pass |
| comparison-01 | pass | pass | FAIL: grounding |
| comparison-02 | pass | pass | FAIL: reply1:mentions:0, reply1:mentions:1 |
| comparison-03 | pass | pass | FAIL: reply1:mentions:0, reply1:mentions:1 |
| invalid-coupon-01 | pass | pass | pass |
| invalid-coupon-02 | pass | pass | FAIL: price_stated |
| invalid-coupon-03 | pass | pass | pass |
| order-status-01 | pass | pass | pass |
| order-status-02 | pass | pass | FAIL: outcome, tool_forbidden:get_tracking, escalation |
| order-status-03 | pass | pass | FAIL |
| order-status-04 | pass | FAIL | FAIL |
| out-of-scope-01 | pass | pass | pass |
| out-of-scope-02 | pass | pass | pass |
| price-deals-01 | pass | pass | pass |
| price-deals-02 | pass | pass | pass |
| price-deals-03 | FAIL: reply1:mentions:0 | pass | FAIL: reply1:mentions:0 |
| price-deals-04 | pass | pass | FAIL: price_stated |
| product-facts-01 | pass | pass | pass |
| product-facts-02 | pass | pass | FAIL: reply1:mentions:1 |
| product-facts-03 | pass | FAIL: turns, outcome | pass |
| recommendation-01 | pass | pass | FAIL: recommendation |
| recommendation-02 | pass | pass | pass |
| recommendation-03 | pass | pass | pass |
| refund-over-limit-01 | pass | FAIL | FAIL |
| refund-over-limit-02 | pass | FAIL | FAIL |
| refund-over-limit-03 | FAIL | FAIL: turns, outcome, goodwill_required:0… | FAIL |
| refund-within-limit-01 | pass | FAIL | pass |
| refund-within-limit-02 | pass | pass | FAIL |
| refund-within-limit-03 | script mismatch | FAIL | FAIL |
| returns-01 | pass | FAIL: money_unexpected:0 | FAIL |
| returns-02 | pass | FAIL: money_unexpected:0 | pass |
| returns-03 | FAIL: reply1:mentions:0 | FAIL | pass |
| returns-04 | pass | pass | FAIL |
| stock-01 | pass | pass | pass |
| stock-02 | pass | FAIL | FAIL |
| stock-03 | pass | pass | FAIL |

## Judge answers that contradict their own reason

0 of 330 judged questions.
