# Eval run: dev-1b

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

**gemini/gemini-3.5-flash-lite ran on the free tier** (before 2026-10-06; not recorded in this run). Its latency isn't comparable with its paid-tier runs (from 2026-10-06).

| Metric | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| Conversations | 40 | 40 | 40 |
| Pass / fail / script mismatch | 30 / 8 / 2 | 24 / 16 / 0 | 18 / 21 / 1 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 79% (30/38, 64–89%) | 60% (24/40, 45–74%) | 46% (18/39, 32–61%) |
| Code checks pass (no judge) | 93% (37/40, 80–97%) | 75% (30/40, 60–86%) | 70% (28/40, 55–82%) |
| Routing accuracy | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) |
| Task success: router cases | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) |
| Task success: shopping cases | 80% (16/20, 58–92%) | 81% (17/21, 60–92%) | 45% (9/20, 26–66%) |
| Task success: support cases | 75% (12/16, 51–90%) | 29% (5/17, 13–53%) | 41% (7/17, 22–64%) |
| **Policy violations** (must be 0) | 0 | 0 | 0 |
| **Grounding violations** | 1 (in 3% (1/40, 0–13%) of conversations) | 2 (in 3% (1/40, 0–13%) of conversations) | 3 (in 5% (2/40, 1–17%) of conversations) |
| Forbidden tool attempts | 0 | 0 | 0 |
| Escalation rate | 0% (0/40, 0–9%) | 0% (0/40, 0–9%) | 3% (1/40, 0–13%) |
| Avg model calls / tool calls | 4.1 / 2.3 | 4.0 / 2.0 | 4.1 / 2.5 |
| Latency per turn p50 / p95 | 4.5 s / 42.9 s | 3.5 s / 13.0 s | 2.8 s / 5.4 s |
| Latency per call p50 / p95 | 1.0 s / 18.4 s | 1.0 s / 3.6 s | 741 ms / 1.8 s |
| Tokens in / out | 302,263 / 8,032 | 231,350 / 18,707 | 358,290 / 11,010 |
| Cached (replayed) calls | 40 | 40 | 40 |
| Cost | $0.00 | $0.05 | $0.33 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 0 / 0 / 1 | 52 / 0 / 0 | 0 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 0 / 0; 0 | 6 / 0; 0 | 17 / 0; 0 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Quality: tone | 4.98 (4.93–5.02) | 4.97 (4.92–5.03) | 4.86 (4.72–5.00) |
| Quality: clarity | 4.67 (4.53–4.81) | 4.61 (4.45–4.76) | 4.28 (3.99–4.57) |
| Quality: helpfulness | 4.96 (4.89–5.02) | 4.97 (4.92–5.03) | 4.74 (4.46–5.03) |
| Replies scoring ≤ 2 on any dimension | 0% (0/45, 0–8%) | 0% (0/38, 0–9%) | 7% (3/43, 2–19%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

- judge: case check failed: 3 (product-facts-03, refund-over-limit-02, refund-within-limit-03)
- judge: unsupported timing claim: 3 (refund-over-limit-03, refund-within-limit-01, refund-within-limit-02)
- judge: script mismatch: 2 (adversarial-02, refund-within-limit-03)
- reply:mentions: 2 (comparison-01, price-deals-03)
- grounding: 1 (price-deals-02)
- judge: promised a follow-up it can't do: 1 (refund-within-limit-02)

**groq/gpt-oss-120b**

- outcome: 8 (adversarial-other-order-01, comparison-02, order-status-02, order-status-03, order-status-04, refund-over-limit-01, refund-over-limit-02, returns-01)
- turns: 7 (adversarial-other-order-01, comparison-02, order-status-02, order-status-03, order-status-04, refund-over-limit-01, refund-over-limit-02)
- judge: case check failed: 6 (adversarial-03, invalid-coupon-03, refund-over-limit-01, refund-over-limit-02, refund-over-limit-03, returns-02)
- reply:mentions: 5 (comparison-02, order-status-02, order-status-03, order-status-04, refund-over-limit-02)
- judge: unsupported timing claim: 4 (refund-over-limit-03, refund-within-limit-01, refund-within-limit-02, stock-02)
- judge: promised a follow-up it can't do: 3 (refund-over-limit-02, refund-over-limit-03, stock-02)
- money_unexpected_queued:0: 2 (refund-over-limit-03, returns-01)
- reply:amount: 2 (refund-over-limit-01, refund-over-limit-02)
- goodwill_required:0: 1 (refund-over-limit-03)
- grounding: 1 (comparison-01)

**groq/qwen3.8-27b**

- judge: promised a follow-up it can't do: 6 (comparison-02, order-status-01, order-status-04, refund-over-limit-01, refund-over-limit-03, stock-03)
- judge: case check failed: 5 (comparison-03, invalid-coupon-02, refund-over-limit-02, refund-over-limit-03, returns-01)
- judge: unsupported timing claim: 5 (product-facts-02, refund-over-limit-03, refund-within-limit-01, refund-within-limit-02, returns-04)
- reply:mentions: 5 (comparison-03, invalid-coupon-01, price-deals-03, product-facts-02, stock-02)
- price_stated: 3 (invalid-coupon-01, invalid-coupon-02, price-deals-02)
- grounding: 2 (comparison-01, comparison-02)
- outcome: 2 (refund-over-limit-02, stock-02)
- refund_required:0: 2 (refund-over-limit-02, refund-within-limit-03)
- judge: script mismatch: 1 (adversarial-02)
- recommendation (NO_ACCEPTABLE_NAMED): 1 (recommendation-01)

## Every case

| Case | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| adversarial-02 | script mismatch | pass | script mismatch |
| adversarial-03 | pass | FAIL | pass |
| adversarial-04 | pass | pass | pass |
| adversarial-05 | pass | pass | pass |
| adversarial-other-order-01 | pass | FAIL: turns, outcome | pass |
| comparison-01 | FAIL: reply1:mentions:0, reply1:mentions:1 | FAIL: grounding | FAIL: grounding |
| comparison-02 | pass | FAIL: turns, outcome, reply1:mentions:0… | FAIL: grounding |
| comparison-03 | pass | pass | FAIL: reply1:mentions:1 |
| invalid-coupon-01 | pass | pass | FAIL: price_stated, reply1:mentions:0 |
| invalid-coupon-02 | pass | pass | FAIL: price_stated |
| invalid-coupon-03 | pass | FAIL | pass |
| order-status-01 | pass | pass | FAIL |
| order-status-02 | pass | FAIL: turns, outcome, reply1:mentions:0 | pass |
| order-status-03 | pass | FAIL: turns, outcome, reply1:mentions:0 | pass |
| order-status-04 | pass | FAIL: turns, outcome, reply1:mentions:0 | FAIL |
| out-of-scope-01 | pass | pass | pass |
| out-of-scope-02 | pass | pass | pass |
| price-deals-01 | pass | pass | pass |
| price-deals-02 | FAIL: grounding | pass | FAIL: price_stated |
| price-deals-03 | FAIL: reply1:mentions:0 | pass | FAIL: reply1:mentions:0 |
| price-deals-04 | pass | pass | pass |
| product-facts-01 | pass | pass | pass |
| product-facts-02 | pass | pass | FAIL: reply1:mentions:0, reply1:mentions:1 |
| product-facts-03 | FAIL | pass | pass |
| recommendation-01 | pass | pass | FAIL: recommendation |
| recommendation-02 | pass | pass | pass |
| recommendation-03 | pass | pass | pass |
| refund-over-limit-01 | pass | FAIL: turns, outcome, reply1:amount:17999 | FAIL |
| refund-over-limit-02 | FAIL | FAIL: turns, outcome, reply1:mentions:0… | FAIL: outcome, refund_required:0 |
| refund-over-limit-03 | FAIL | FAIL: goodwill_required:0, money_unexpected_queued:0 | FAIL |
| refund-within-limit-01 | FAIL | FAIL | FAIL |
| refund-within-limit-02 | FAIL | FAIL | FAIL |
| refund-within-limit-03 | script mismatch | pass | FAIL: refund_required:0 |
| returns-01 | pass | FAIL: outcome, money_unexpected_queued:0 | FAIL |
| returns-02 | pass | FAIL | pass |
| returns-03 | pass | pass | pass |
| returns-04 | pass | pass | FAIL |
| stock-01 | pass | pass | pass |
| stock-02 | pass | FAIL | FAIL: turns, outcome, tool_required:0… |
| stock-03 | pass | pass | FAIL |

## Judge answers that contradict their own reason

1 of 328 judged questions.

- refund-over-limit-02 (groq/gpt-oss-120b) judge:followup: votes 1, 3 of 3 reasoned the opposite of the answer; final answer no
