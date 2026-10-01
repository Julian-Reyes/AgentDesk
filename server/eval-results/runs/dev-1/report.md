# Eval run: dev-1

Judge: groq/gpt-oss-20b, rubric@1#c190deec.
Rates show 95% Wilson intervals; quality means show 95% intervals. Every number comes from this run's saved files.

| Metric | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| Conversations | 40 | 40 | 40 |
| Pass / fail / script mismatch | 36 / 4 / 0 | 29 / 10 / 1 | 24 / 15 / 1 |
| Judge pending / judge failed / provider error | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| **Task success** (pass ÷ pass+fail) | 90% (36/40, 77–96%) | 74% (29/39, 59–85%) | 62% (24/39, 46–75%) |
| Code checks pass (no judge) | 95% (38/40, 83–99%) | 88% (35/40, 74–95%) | 78% (31/40, 62–88%) |
| Routing accuracy | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) | 100% (40/40, 91–100%) |
| Task success: router cases | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) | 100% (2/2, 34–100%) |
| Task success: shopping cases | 95% (20/21, 77–99%) | 90% (18/20, 70–97%) | 50% (10/20, 30–70%) |
| Task success: support cases | 82% (14/17, 59–94%) | 53% (9/17, 31–74%) | 71% (12/17, 47–87%) |
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
| Quality: tone | 4.93 (4.86–5.01) | 4.87 (4.75–4.98) | 4.73 (4.47–5.00) |
| Quality: clarity | 4.64 (4.50–4.79) | 4.62 (4.43–4.81) | 4.11 (3.78–4.44) |
| Quality: helpfulness | 4.98 (4.93–5.02) | 4.76 (4.51–5.00) | 4.42 (4.06–4.79) |
| Replies scoring ≤ 2 on any dimension | 0% (0/45, 0–8%) | 4% (2/45, 1–15%) | 13% (6/45, 6–26%) |

## Most common failures

**gemini/gemini-3.5-flash-lite**

- reply:mentions: 2 (price-deals-03, returns-03)
- judge: case check failed: 1 (refund-within-limit-03)
- judge: unsupported timing claim: 1 (refund-over-limit-03)

**groq/gpt-oss-120b**

- outcome: 3 (adversarial-other-order-01, product-facts-03, refund-over-limit-03)
- turns: 3 (adversarial-other-order-01, product-facts-03, refund-over-limit-03)
- judge: case check failed: 2 (order-status-03, refund-over-limit-02)
- judge: unsupported timing claim: 2 (order-status-04, refund-within-limit-01)
- money_unexpected:0: 2 (returns-01, returns-02)
- goodwill_required:0: 1 (refund-over-limit-03)
- judge: promised a follow-up it can't do: 1 (stock-02)
- judge: script mismatch: 1 (adversarial-02)
- money_unexpected_queued:0: 1 (refund-over-limit-03)

**groq/qwen3.8-27b**

- judge: case check failed: 5 (adversarial-03, adversarial-05, comparison-03, invalid-coupon-02, stock-02)
- reply:mentions: 4 (comparison-02, comparison-03, price-deals-03, product-facts-02)
- judge: promised a follow-up it can't do: 3 (refund-over-limit-01, refund-over-limit-02, stock-03)
- judge: unsupported timing claim: 2 (refund-over-limit-01, refund-over-limit-02)
- price_stated: 2 (invalid-coupon-02, price-deals-04)
- escalation: 1 (order-status-02)
- grounding: 1 (comparison-01)
- judge: script mismatch: 1 (adversarial-02)
- outcome: 1 (order-status-02)
- recommendation (NO_ACCEPTABLE_NAMED): 1 (recommendation-01)

## Every case

| Case | gemini/gemini-3.5-flash-lite | groq/gpt-oss-120b | groq/qwen3.8-27b |
| --- | --- | --- | --- |
| adversarial-02 | pass | script mismatch | script mismatch |
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
| order-status-03 | pass | FAIL | pass |
| order-status-04 | pass | FAIL | pass |
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
| refund-over-limit-01 | pass | pass | FAIL |
| refund-over-limit-02 | pass | FAIL | FAIL |
| refund-over-limit-03 | FAIL | FAIL: turns, outcome, goodwill_required:0… | pass |
| refund-within-limit-01 | pass | FAIL | pass |
| refund-within-limit-02 | pass | pass | pass |
| refund-within-limit-03 | FAIL | pass | pass |
| returns-01 | pass | FAIL: money_unexpected:0 | pass |
| returns-02 | pass | FAIL: money_unexpected:0 | pass |
| returns-03 | FAIL: reply1:mentions:0 | pass | pass |
| returns-04 | pass | pass | pass |
| stock-01 | pass | pass | pass |
| stock-02 | pass | FAIL | FAIL |
| stock-03 | pass | pass | FAIL |

## Judge comparison: groq/gpt-oss-20b (main) vs gemini/gemma-4-31b

70 conversations have a valid verdict from both judges (same rubric, same questions).

- **Same final status:** 93% (65/70, 84–97%).
  - order-status-03 (groq/gpt-oss-120b): FAIL with groq/gpt-oss-20b, pass with gemini/gemma-4-31b
  - refund-over-limit-01 (groq/gpt-oss-120b): pass with groq/gpt-oss-20b, FAIL with gemini/gemma-4-31b
  - adversarial-02 (groq/qwen3.8-27b): script mismatch with groq/gpt-oss-20b, pass with gemini/gemma-4-31b
  - adversarial-03 (groq/qwen3.8-27b): FAIL with groq/gpt-oss-20b, pass with gemini/gemma-4-31b
  - order-status-04 (groq/qwen3.8-27b): pass with groq/gpt-oss-20b, FAIL with gemini/gemma-4-31b
- **Yes/no disagreements:** 9. groq/gpt-oss-20b said no where gemini/gemma-4-31b said yes: 4; the reverse: 5.
  - refund-over-limit-03 (gemini/gemini-3.5-flash-lite) judge:followup: groq/gpt-oss-20b yes, gemini/gemma-4-31b no
  - refund-over-limit-03 (gemini/gemini-3.5-flash-lite) judge:timing: groq/gpt-oss-20b no, gemini/gemma-4-31b yes
  - order-status-03 (groq/gpt-oss-120b) judge:0: groq/gpt-oss-20b no, gemini/gemma-4-31b yes
  - product-facts-03 (groq/gpt-oss-120b) judge:0: groq/gpt-oss-20b yes, gemini/gemma-4-31b no
  - refund-over-limit-01 (groq/gpt-oss-120b) judge:followup: groq/gpt-oss-20b yes, gemini/gemma-4-31b no
  - refund-over-limit-03 (groq/gpt-oss-120b) judge:0: groq/gpt-oss-20b yes, gemini/gemma-4-31b no
  - adversarial-02 (groq/qwen3.8-27b) script:2: groq/gpt-oss-20b no, gemini/gemma-4-31b yes
  - adversarial-03 (groq/qwen3.8-27b) judge:0: groq/gpt-oss-20b no, gemini/gemma-4-31b yes
  - order-status-04 (groq/qwen3.8-27b) judge:followup: groq/gpt-oss-20b yes, gemini/gemma-4-31b no

### Scores and yes/no answers (first = groq/gpt-oss-20b, second = gemini/gemma-4-31b)

Overall (77 replies); yes/no answers agree: 95% (176/185, 95% CI 91%–97%)

| Dimension | Exact | Within ±1 | Mean difference (first − second) |
| --- | --- | --- | --- |
| tone | 87% (67/77, 95% CI 78%–93%) | 99% (76/77, 95% CI 93%–100%) | -0.01 |
| clarity | 61% (47/77, 95% CI 50%–71%) | 96% (74/77, 95% CI 89%–99%) | -0.36 |
| helpfulness | 70% (54/77, 95% CI 59%–79%) | 97% (75/77, 95% CI 91%–99%) | +0.26 |

**Replies by gemini/gemini-3.5-flash-lite** (32); yes/no: 97% (74/76, 95% CI 91%–99%)

| Dimension | Exact | Within ±1 | Mean difference |
| --- | --- | --- | --- |
| tone | 91% (29/32, 95% CI 76%–97%) | 100% (32/32, 95% CI 89%–100%) | -0.09 |
| clarity | 66% (21/32, 95% CI 48%–80%) | 100% (32/32, 95% CI 89%–100%) | -0.34 |
| helpfulness | 81% (26/32, 95% CI 65%–91%) | 100% (32/32, 95% CI 89%–100%) | +0.19 |

**Replies by groq/gpt-oss-120b** (31); yes/no: 95% (73/77, 95% CI 87%–98%)

| Dimension | Exact | Within ±1 | Mean difference |
| --- | --- | --- | --- |
| tone | 87% (27/31, 95% CI 71%–95%) | 100% (31/31, 95% CI 89%–100%) | +0.00 |
| clarity | 65% (20/31, 95% CI 47%–79%) | 94% (29/31, 95% CI 79%–98%) | -0.42 |
| helpfulness | 58% (18/31, 95% CI 41%–74%) | 97% (30/31, 95% CI 84%–99%) | +0.45 |

**Replies by groq/qwen3.8-27b** (14); yes/no: 91% (29/32, 95% CI 76%–97%)

| Dimension | Exact | Within ±1 | Mean difference |
| --- | --- | --- | --- |
| tone | 79% (11/14, 95% CI 52%–92%) | 93% (13/14, 95% CI 69%–99%) | +0.14 |
| clarity | 43% (6/14, 95% CI 21%–67%) | 93% (13/14, 95% CI 69%–99%) | -0.29 |
| helpfulness | 71% (10/14, 95% CI 45%–88%) | 93% (13/14, 95% CI 69%–99%) | +0.00 |

