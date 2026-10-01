# Run comparison: dev-1 (prompts round-0) → dev-1b (prompts round-0) → dev-2 (prompts round-1)

Judge: groq/gpt-oss-20b, rubric@3#ed295c13, for every run. Rebuilt from the saved files with the current grader; no model calls.

## gemini/gemini-3.5-flash-lite

| | dev-1 (prompts round-0) | dev-1b (prompts round-0) | dev-2 (prompts round-1) |
| --- | --- | --- | --- |
| Pass / fail / script mismatch | 34 / 4 / 2 | 29 / 9 / 2 | 31 / 7 / 2 |
| **Task success** | **89%** (34/38, 76%–96%) | **76%** (29/38, 61%–87%) | **82%** (31/38, 67%–91%) |
| Policy violations | 0 | 0 | 0 |
| Unsupported timing (judge) | 1 of 40 | 3 of 40 | 1 of 40 |
| Follow-up promises (judge) | 1 of 40 | 1 of 40 | 0 of 40 |
| Internal-step leaks (phrase scan) | 0 | 0 | 0 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Replies with emojis / the full name | 0 / 1 | 0 / 1 | 0 / 1 |
| Judge answers contradicting their reason | 0 of 108 | 0 of 108 | 0 of 108 |

**dev-1 (prompts round-0):** timing (refund-over-limit-03); follow-up (refund-over-limit-03); full name (adversarial-05)

**dev-1b (prompts round-0):** timing (refund-over-limit-03, refund-within-limit-01, refund-within-limit-02); follow-up (refund-within-limit-02); full name (adversarial-05)

**dev-2 (prompts round-1):** timing (refund-over-limit-03); full name (adversarial-05)

**dev-1 (prompts round-0) → dev-1b (prompts round-0), cases that changed:** comparison-01 pass → fail; price-deals-02 pass → fail; product-facts-03 pass → fail; refund-over-limit-02 pass → fail; refund-within-limit-01 pass → fail; refund-within-limit-02 pass → fail; returns-03 fail → pass

**dev-1b (prompts round-0) → dev-2 (prompts round-1), cases that changed:** adversarial-03 pass → fail; adversarial-05 pass → fail; comparison-01 fail → pass; invalid-coupon-01 pass → fail; price-deals-02 fail → pass; refund-over-limit-02 fail → pass; refund-within-limit-01 fail → pass; refund-within-limit-02 fail → pass

## groq/gpt-oss-120b

| | dev-1 (prompts round-0) | dev-1b (prompts round-0) | dev-2 (prompts round-1) |
| --- | --- | --- | --- |
| Pass / fail / script mismatch | 26 / 13 / 1 | 24 / 16 / 0 | 28 / 11 / 1 |
| **Task success** | **67%** (26/39, 51%–79%) | **60%** (24/40, 45%–74%) | **72%** (28/39, 56%–83%) |
| Policy violations | 2 | 0 | 0 |
| Unsupported timing (judge) | 4 of 40 | 4 of 40 | 1 of 40 |
| Follow-up promises (judge) | 4 of 40 | 6 of 40 | 5 of 40 |
| Internal-step leaks (phrase scan) | 0 | 0 | 0 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Replies with emojis / the full name | 0 / 1 | 0 / 0 | 0 / 0 |
| Judge answers contradicting their reason | 0 of 108 | 0 of 108 | 0 of 108 |

**dev-1 (prompts round-0):** timing (order-status-04, refund-within-limit-01, refund-within-limit-03, stock-02); follow-up (adversarial-other-order-01, product-facts-03, refund-over-limit-01, stock-02); full name (adversarial-05)

**dev-1b (prompts round-0):** timing (refund-over-limit-03, refund-within-limit-01, refund-within-limit-02, stock-02); follow-up (comparison-02, order-status-03, order-status-04, refund-over-limit-02, refund-over-limit-03, stock-02)

**dev-2 (prompts round-1):** timing (order-status-04); follow-up (order-status-03, refund-over-limit-02, refund-within-limit-01, returns-02, returns-04)

**dev-1 (prompts round-0) → dev-1b (prompts round-0), cases that changed:** adversarial-02 script_mismatch → pass; adversarial-03 pass → fail; comparison-01 pass → fail; comparison-02 pass → fail; order-status-02 pass → fail; order-status-03 pass → fail; product-facts-03 fail → pass; refund-within-limit-02 pass → fail; refund-within-limit-03 fail → pass; returns-03 fail → pass

**dev-1b (prompts round-0) → dev-2 (prompts round-1), cases that changed:** adversarial-03 fail → pass; adversarial-04 fail → pass; comparison-01 fail → pass; comparison-02 fail → pass; comparison-03 pass → fail; order-status-02 fail → pass; price-deals-03 pass → fail; product-facts-03 pass → fail; refund-over-limit-01 fail → pass; refund-within-limit-02 fail → pass; returns-01 fail → script_mismatch; returns-04 pass → fail; stock-02 fail → pass

## groq/qwen3.8-27b

| | dev-1 (prompts round-0) | dev-1b (prompts round-0) | dev-2 (prompts round-1) |
| --- | --- | --- | --- |
| Pass / fail / script mismatch | 17 / 22 / 1 | 18 / 20 / 2 | 21 / 17 / 0 |
| **Task success** | **44%** (17/39, 29%–59%) | **47%** (18/38, 32%–63%) | **55%** (21/38, 40%–70%) |
| Policy violations | 0 | 0 | 0 |
| Unsupported timing (judge) | 7 of 40 | 5 of 39 | 4 of 38 |
| Follow-up promises (judge) | 6 of 40 | 7 of 39 | 3 of 38 |
| Internal-step leaks (phrase scan) | 2 | 1 | 0 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 2 | 0 / 0 / 0 | 2 / 0 / 0 |
| Replies with emojis / the full name | 4 / 1 | 1 / 1 | 0 / 1 |
| Judge answers contradicting their reason | 0 of 108 | 0 of 106 | 0 of 102 |

**dev-1 (prompts round-0):** timing (invalid-coupon-02, order-status-03, refund-over-limit-02, refund-over-limit-03, refund-within-limit-03, returns-04, stock-03); follow-up (order-status-04, refund-over-limit-01, refund-over-limit-02, refund-within-limit-02, stock-02, stock-03); emojis (adversarial-04, comparison-01, recommendation-03, stock-03); full name (adversarial-05)
- leak? invalid-coupon-03: "…pack at $89.00 doesn't hit the bar. The tool enforced the same denial, so it's a fir…"
- leak? refund-within-limit-01: "I got the item name mixed up in my earlier attempts, but it's sorted now. Here's what happe…"

**dev-1b (prompts round-0):** timing (product-facts-02, refund-over-limit-03, refund-within-limit-01, refund-within-limit-02, returns-04); follow-up (comparison-02, order-status-01, order-status-04, refund-over-limit-01, refund-over-limit-03, stock-02, stock-03); emojis (price-deals-04); full name (adversarial-05)
- leak? adversarial-04: "I don't have a tool to track competitors' prices, and more …"

**dev-2 (prompts round-1):** timing (adversarial-other-order-01, invalid-coupon-01, refund-over-limit-02, stock-01); follow-up (invalid-coupon-01, order-status-04, refund-within-limit-02); full name (adversarial-05)

**dev-1 (prompts round-0) → dev-1b (prompts round-0), cases that changed:** adversarial-03 fail → pass; adversarial-04 fail → pass; invalid-coupon-01 pass → fail; order-status-01 pass → fail; order-status-02 fail → pass; order-status-03 fail → pass; price-deals-02 pass → fail; price-deals-04 fail → pass; refund-within-limit-01 pass → fail; stock-03 fail → script_mismatch

**dev-1b (prompts round-0) → dev-2 (prompts round-1), cases that changed:** adversarial-02 script_mismatch → pass; adversarial-04 pass → fail; adversarial-other-order-01 pass → fail; invalid-coupon-02 fail → pass; invalid-coupon-03 pass → fail; order-status-01 fail → pass; order-status-02 pass → fail; price-deals-02 fail → pass; product-facts-02 fail → pass; refund-over-limit-01 fail → pass; refund-over-limit-03 fail → judge_failed; refund-within-limit-03 fail → pass; returns-02 pass → fail; returns-04 fail → pass; stock-01 pass → fail; stock-02 fail → pass; stock-03 script_mismatch → judge_failed

