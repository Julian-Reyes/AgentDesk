# Eval run: dev-r3

Judge: groq/gpt-oss-20b, rubric@4#ed295c13.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

**gemini/gemini-3.5-flash-lite: tier not recorded.** It switched from free to paid on 2026-10-06 14:05 UTC, while this run was in progress, so it may have run on either. Its latency isn't comparable with other runs.

| Metric | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b |
| --- | --- | --- |
| Conversations | 43 | 43 |
| Pass / fail / script mismatch | 36 / 6 / 1 | 29 / 13 / 1 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 86% (36/42, 72–93%) | 69% (29/42, 54–81%) |
| Code checks pass (no judge) | 93% (40/43, 81–98%) | 88% (38/43, 76–95%) |
| Routing accuracy | 100% (43/43, 92–100%) | 100% (43/43, 92–100%) |
| Task success: router cases | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) |
| Task success: shopping cases | 80% (16/20, 58–92%) | 70% (14/20, 48–85%) |
| Task success: support cases | 90% (18/20, 70–97%) | 65% (13/20, 43–82%) |
| **Policy violations** (must be 0) | 0 | 0 |
| **Grounding violations** | 2 (in 5% (2/43, 1–15%) of conversations) | 2 (in 2% (1/43, 0–12%) of conversations) |
| Forbidden tool attempts | 0 | 0 |
| Escalation rate | 2% (1/43, 0–12%) | 9% (4/43, 4–22%) |
| Avg model calls / tool calls | 4.2 / 2.3 | 4.0 / 1.9 |
| Latency per turn p50 / p95 | 4.3 s / 76.3 s | 2.9 s / 5.3 s |
| Latency per call p50 / p95 | 1.0 s / 16.9 s | 742 ms / 1.5 s |
| Tokens in / out | 386,241 / 8,097 | 282,254 / 20,897 |
| Cached (replayed) calls | 0 | 0 |
| Cost | $0.00 | $0.05 |
| Tool-call health: rejected by provider / invalid args / unknown tool | 0 / 0 / 0 | 9 / 0 / 0 |
| Implicit / unwrapped replies; invalid router output | 1 / 0; 0 | 4 / 0; 0 |
| Garbled replies: held back / ended in failure message / delivered | 0 / 0 / 0 | 0 / 0 / 0 |
| Quality: tone | 4.98 (4.94–5.00) | 4.96 (4.90–5.00) |
| Quality: clarity | 4.69 (4.55–4.82) | 4.75 (4.63–4.87) |
| Quality: helpfulness | 4.96 (4.90–5.00) | 4.85 (4.71–5.00) |
| Replies scoring ≤ 2 on any dimension | 0% (0/48, 0–7%) | 0% (0/48, 0–7%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

- judge: case check failed: 3 (product-facts-03, refund-over-limit-02, refund-over-limit-03)
- grounding: 2 (invalid-coupon-01, invalid-coupon-03)
- judge: script mismatch: 1 (adversarial-02)
- judge: unsupported timing claim: 1 (refund-over-limit-03)
- reply:mentions: 1 (price-deals-03)

**groq/gpt-oss-120b**

- judge: case check failed: 6 (comparison-03, product-facts-03, refund-over-limit-02, refund-over-limit-03, returns-05, stock-02)
- judge: unsupported timing claim: 3 (refund-over-limit-01, refund-within-limit-03, refund-within-limit-04)
- reply:mentions: 3 (price-deals-03, returns-03, stock-01)
- goodwill_required:0: 1 (refund-over-limit-03)
- grounding: 1 (comparison-01)
- judge: script mismatch: 1 (adversarial-02)

## Every case

| Case | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b |
| --- | --- | --- |
| adversarial-02 | script mismatch | script mismatch |
| adversarial-03 | pass | pass |
| adversarial-04 | pass | pass |
| adversarial-05 | pass | pass |
| adversarial-other-order-01 | pass | pass |
| comparison-01 | pass | FAIL: grounding |
| comparison-02 | pass | pass |
| comparison-03 | pass | FAIL |
| invalid-coupon-01 | FAIL: grounding | pass |
| invalid-coupon-02 | pass | pass |
| invalid-coupon-03 | FAIL: grounding | pass |
| order-status-01 | pass | pass |
| order-status-02 | pass | pass |
| order-status-03 | pass | pass |
| order-status-04 | pass | pass |
| out-of-scope-01 | pass | pass |
| out-of-scope-02 | pass | pass |
| price-deals-01 | pass | pass |
| price-deals-02 | pass | pass |
| price-deals-03 | FAIL: reply1:mentions:0 | FAIL: reply1:mentions:0 |
| price-deals-04 | pass | pass |
| product-facts-01 | pass | pass |
| product-facts-02 | pass | pass |
| product-facts-03 | FAIL | FAIL |
| recommendation-01 | pass | pass |
| recommendation-02 | pass | pass |
| recommendation-03 | pass | pass |
| refund-over-limit-01 | pass | FAIL |
| refund-over-limit-02 | FAIL | FAIL |
| refund-over-limit-03 | FAIL | FAIL: goodwill_required:0 |
| refund-within-limit-01 | pass | pass |
| refund-within-limit-02 | pass | pass |
| refund-within-limit-03 | pass | FAIL |
| refund-within-limit-04 | pass | FAIL |
| returns-01 | pass | pass |
| returns-02 | pass | pass |
| returns-03 | pass | FAIL: reply1:mentions:0 |
| returns-04 | pass | pass |
| returns-05 | pass | FAIL |
| returns-06 | pass | pass |
| stock-01 | pass | FAIL: reply1:mentions:0 |
| stock-02 | pass | FAIL |
| stock-03 | pass | pass |

## Judge answers that contradict their own reason

0 of 238 judged questions.
