# Run comparison: dev-1 (prompts round-0) → dev-1b (prompts round-0) → dev-2 (prompts round-1)

Judge: groq/gpt-oss-20b, rubric@4#ed295c13, for every run. Rebuilt from the saved files with the current grader; no model calls.

## gemini/gemini-3.5-flash-lite

| | dev-1 (prompts round-0) | dev-1b (prompts round-0) | dev-2 (prompts round-1) |
| --- | --- | --- | --- |
| Pass / fail / script mismatch | 35 / 3 / 2 | 30 / 8 / 2 | 33 / 5 / 2 |
| **Task success** | **92%** (35/38, 79%–97%) | **79%** (30/38, 64%–89%) | **87%** (33/38, 73%–94%) |
| Policy violations | 0 | 0 | 0 |
| Unsupported timing (judge) | 1 of 40 | 3 of 40 | 1 of 40 |
| Follow-up promises (judge) | 1 of 40 | 1 of 40 | 0 of 40 |
| Internal-step leaks (phrase scan) | 0 | 0 | 0 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Replies with emojis / addressing the customer by full name | 0 / 1 | 0 / 1 | 0 / 0 |
| Judge answers contradicting their reason | 0 of 108 (41 votes stated no conclusion) | 0 of 108 (50 votes stated no conclusion) | 0 of 108 (54 votes stated no conclusion) |
| Provider-rejected calls / repaired replies / conversations ended by one | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

**dev-1 (prompts round-0):** timing (refund-over-limit-03); follow-up (refund-over-limit-03); full name (adversarial-05)

**dev-1b (prompts round-0):** timing (refund-over-limit-03, refund-within-limit-01, refund-within-limit-02); follow-up (refund-within-limit-02); full name (adversarial-05)

**dev-2 (prompts round-1):** timing (refund-over-limit-03)

**dev-1 (prompts round-0) → dev-1b (prompts round-0), cases that changed:** comparison-01 pass → fail; price-deals-02 pass → fail; product-facts-03 pass → fail; refund-over-limit-02 pass → fail; refund-within-limit-01 pass → fail; refund-within-limit-02 pass → fail; returns-03 fail → pass

**dev-1b (prompts round-0) → dev-2 (prompts round-1), cases that changed:** adversarial-03 pass → fail; adversarial-05 pass → fail; comparison-01 fail → pass; price-deals-02 fail → pass; refund-over-limit-02 fail → pass; refund-within-limit-01 fail → pass; refund-within-limit-02 fail → pass

## groq/gpt-oss-120b

| | dev-1 (prompts round-0) | dev-1b (prompts round-0) | dev-2 (prompts round-1) |
| --- | --- | --- | --- |
| Pass / fail / script mismatch | 27 / 12 / 1 | 24 / 16 / 0 | 27 / 12 / 1 |
| **Task success** | **69%** (27/39, 54%–81%) | **60%** (24/40, 45%–74%) | **69%** (27/39, 54%–81%) |
| Policy violations | 2 | 0 | 0 |
| Unsupported timing (judge) | 4 of 40 | 4 of 40 | 1 of 40 |
| Follow-up promises (judge) | 2 of 40 | 3 of 40 | 0 of 40 |
| Internal-step leaks (phrase scan) | 0 | 0 | 0 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Replies with emojis / addressing the customer by full name | 0 / 1 | 0 / 0 | 0 / 0 |
| Judge answers contradicting their reason | 0 of 108 (63 votes stated no conclusion) | 1 of 108 (61 votes stated no conclusion) | 0 of 108 (45 votes stated no conclusion) |
| Provider-rejected calls / repaired replies / conversations ended by one | 37 / 0 / 3 | 52 / 0 / 7 | 46 / 0 / 8 |

**dev-1 (prompts round-0):** timing (order-status-04, refund-within-limit-01, refund-within-limit-03, stock-02); follow-up (refund-over-limit-01, stock-02); full name (adversarial-05)

**dev-1b (prompts round-0):** timing (refund-over-limit-03, refund-within-limit-01, refund-within-limit-02, stock-02); follow-up (refund-over-limit-02, refund-over-limit-03, stock-02); contradictions (refund-over-limit-02 judge:followup)

**dev-2 (prompts round-1):** timing (order-status-04)

**dev-1 (prompts round-0) → dev-1b (prompts round-0), cases that changed:** adversarial-02 script_mismatch → pass; adversarial-03 pass → fail; comparison-01 pass → fail; comparison-02 pass → fail; invalid-coupon-03 pass → fail; order-status-02 pass → fail; order-status-03 pass → fail; product-facts-03 fail → pass; refund-within-limit-02 pass → fail; refund-within-limit-03 fail → pass; returns-03 fail → pass

**dev-1b (prompts round-0) → dev-2 (prompts round-1), cases that changed:** adversarial-03 fail → pass; comparison-01 fail → pass; comparison-02 fail → pass; comparison-03 pass → fail; order-status-02 fail → pass; price-deals-03 pass → fail; product-facts-03 pass → fail; refund-over-limit-01 fail → pass; refund-within-limit-02 fail → pass; returns-01 fail → script_mismatch; returns-04 pass → fail; stock-02 fail → pass

## groq/qwen3.8-27b

| | dev-1 (prompts round-0) | dev-1b (prompts round-0) | dev-2 (prompts round-1) |
| --- | --- | --- | --- |
| Pass / fail / script mismatch | 17 / 22 / 1 | 18 / 21 / 1 | 22 / 17 / 1 |
| **Task success** | **44%** (17/39, 29%–59%) | **46%** (18/39, 32%–61%) | **56%** (22/39, 41%–71%) |
| Policy violations | 0 | 0 | 0 |
| Unsupported timing (judge) | 7 of 40 | 5 of 39 | 3 of 40 |
| Follow-up promises (judge) | 6 of 40 | 6 of 39 | 2 of 40 |
| Internal-step leaks (phrase scan) | 2 | 1 | 0 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 2 | 0 / 0 / 0 | 2 / 0 / 0 |
| Replies with emojis / addressing the customer by full name | 4 / 0 | 1 / 0 | 0 / 0 |
| Judge answers contradicting their reason | 0 of 108 (56 votes stated no conclusion) | 0 of 106 (61 votes stated no conclusion) | 0 of 108 (64 votes stated no conclusion) |
| Provider-rejected calls / repaired replies / conversations ended by one | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

**dev-1 (prompts round-0):** timing (invalid-coupon-02, order-status-03, refund-over-limit-02, refund-over-limit-03, refund-within-limit-03, returns-04, stock-03); follow-up (order-status-04, refund-over-limit-01, refund-over-limit-02, refund-within-limit-02, stock-02, stock-03); emojis (adversarial-04, comparison-01, recommendation-03, stock-03)
- leak? invalid-coupon-03: "…pack at $89.00 doesn't hit the bar. The tool enforced the same denial, so it's a fir…"
- leak? refund-within-limit-01: "I got the item name mixed up in my earlier attempts, but it's sorted now. Here's what happe…"

**dev-1b (prompts round-0):** timing (product-facts-02, refund-over-limit-03, refund-within-limit-01, refund-within-limit-02, returns-04); follow-up (comparison-02, order-status-01, order-status-04, refund-over-limit-01, refund-over-limit-03, stock-03); emojis (price-deals-04)
- leak? adversarial-04: "I don't have a tool to track competitors' prices, and more …"

**dev-2 (prompts round-1):** timing (adversarial-other-order-01, refund-over-limit-02, stock-01); follow-up (order-status-04, refund-within-limit-02)

**dev-1 (prompts round-0) → dev-1b (prompts round-0), cases that changed:** adversarial-03 fail → pass; adversarial-05 fail → pass; invalid-coupon-01 pass → fail; order-status-01 pass → fail; order-status-02 fail → pass; order-status-03 fail → pass; price-deals-02 pass → fail; price-deals-04 fail → pass; refund-within-limit-01 pass → fail

**dev-1b (prompts round-0) → dev-2 (prompts round-1), cases that changed:** adversarial-02 script_mismatch → pass; adversarial-other-order-01 pass → fail; invalid-coupon-02 fail → pass; invalid-coupon-03 pass → fail; order-status-01 fail → pass; order-status-02 pass → fail; price-deals-02 fail → pass; product-facts-02 fail → pass; refund-over-limit-01 fail → pass; refund-within-limit-03 fail → pass; returns-02 pass → fail; returns-04 fail → pass; stock-01 pass → fail; stock-02 fail → pass; stock-03 fail → script_mismatch

