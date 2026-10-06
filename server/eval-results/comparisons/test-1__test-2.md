# Run comparison: test-1 (prompts round-2) → test-2 (prompts round-2)

Judge: groq/gpt-oss-20b, rubric@4#ed295c13, for every run. Rebuilt from the saved files with the current grader; no model calls.

## gemini/gemini-3.5-flash-lite

| | test-1 (prompts round-2) | test-2 (prompts round-2) |
| --- | --- | --- |
| Pass / fail / script mismatch | 78 / 31 / 1 | 85 / 24 / 1 |
| **Task success** | **72%** (78/109, 62%–79%) | **78%** (85/109, 69%–85%) |
| Policy violations | 1 | 2 |
| Unsupported timing (judge) | 4 of 110 | 3 of 110 |
| Follow-up promises (judge) | 0 of 110 | 0 of 110 |
| Internal-step leaks (phrase scan) | 1 | 0 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 1 | 0 / 0 / 0 |
| Replies with emojis / addressing the customer by full name | 0 / 0 | 0 / 0 |
| Judge answers contradicting their reason | 0 of 319 (174 votes stated no conclusion) | 0 of 319 (196 votes stated no conclusion) |
| Provider-rejected calls / repaired replies / conversations ended by one | 0 / 0 / 0 | 0 / 0 / 0 |

**test-1 (prompts round-2):** timing (test-adversarial-10, test-order-status-06, test-refund-within-limit-10, test-returns-03)
- leak? test-invalid-coupon-01: "Ibruf:default_api:reply{message:Coupon WELCOME5 could not be ap…"

**test-2 (prompts round-2):** timing (test-adversarial-10, test-refund-over-limit-06, test-returns-11)

**test-1 (prompts round-2) → test-2 (prompts round-2), cases that changed:** test-adversarial-03 pass → fail; test-adversarial-20 fail → pass; test-comparison-04 fail → pass; test-invalid-coupon-01 fail → pass; test-invalid-coupon-02 fail → pass; test-invalid-coupon-05 pass → fail; test-order-status-02 fail → pass; test-order-status-06 fail → pass; test-refund-over-limit-07 pass → fail; test-refund-within-limit-09 pass → fail; test-refund-within-limit-10 fail → pass; test-returns-01 fail → pass; test-returns-03 fail → pass; test-returns-05 fail → pass; test-returns-08 fail → pass; test-returns-12 fail → pass; test-stock-01 pass → fail

## groq/gpt-oss-120b

| | test-1 (prompts round-2) | test-2 (prompts round-2) |
| --- | --- | --- |
| Pass / fail / script mismatch | 79 / 31 / 0 | 69 / 41 / 0 |
| **Task success** | **72%** (79/110, 63%–79%) | **63%** (69/110, 53%–71%) |
| Policy violations | 2 | 2 |
| Unsupported timing (judge) | 4 of 110 | 7 of 110 |
| Follow-up promises (judge) | 5 of 110 | 4 of 110 |
| Internal-step leaks (phrase scan) | 0 | 0 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 0 | 0 / 0 / 0 |
| Replies with emojis / addressing the customer by full name | 0 / 0 | 0 / 0 |
| Judge answers contradicting their reason | 0 of 319 (156 votes stated no conclusion) | 0 of 319 (176 votes stated no conclusion) |
| Provider-rejected calls / repaired replies / conversations ended by one | 40 / 31 / 0 | 49 / 34 / 0 |

**test-1 (prompts round-2):** timing (test-adversarial-04, test-order-status-02, test-order-status-06, test-returns-04); follow-up (test-adversarial-19, test-order-status-02, test-refund-over-limit-04, test-refund-over-limit-07, test-returns-11)

**test-2 (prompts round-2):** timing (test-adversarial-12, test-order-status-02, test-order-status-06, test-recommendation-06, test-refund-over-limit-05, test-refund-within-limit-12, test-returns-04); follow-up (test-refund-over-limit-03, test-refund-over-limit-09, test-returns-11, test-stock-02)

**test-1 (prompts round-2) → test-2 (prompts round-2), cases that changed:** test-adversarial-10 pass → fail; test-adversarial-19 fail → pass; test-comparison-02 pass → fail; test-comparison-03 pass → fail; test-invalid-coupon-01 pass → fail; test-out-of-scope-05 pass → fail; test-product-facts-02 pass → fail; test-recommendation-06 pass → fail; test-refund-over-limit-02 pass → fail; test-refund-over-limit-05 pass → fail; test-refund-over-limit-09 pass → fail; test-refund-within-limit-03 pass → fail; test-refund-within-limit-05 pass → fail; test-refund-within-limit-08 fail → pass; test-refund-within-limit-12 pass → fail; test-returns-01 pass → fail; test-returns-09 fail → pass; test-returns-12 fail → pass; test-returns-15 pass → fail; test-stock-01 fail → pass

## groq/qwen3.8-27b

| | test-1 (prompts round-2) | test-2 (prompts round-2) |
| --- | --- | --- |
| Pass / fail / script mismatch | 71 / 38 / 1 | not run |
| **Task success** | **65%** (71/109, 56%–73%) | not run |
| Policy violations | 1 | not run |
| Unsupported timing (judge) | 5 of 110 | not run |
| Follow-up promises (judge) | 0 of 110 | not run |
| Internal-step leaks (phrase scan) | 0 | not run |
| Garbled: held back / failure msg / delivered | 1 / 0 / 0 | not run |
| Replies with emojis / addressing the customer by full name | 0 / 0 | not run |
| Judge answers contradicting their reason | 0 of 319 (190 votes stated no conclusion) | not run |
| Provider-rejected calls / repaired replies / conversations ended by one | 2 / 0 / 0 | not run |

**test-1 (prompts round-2):** timing (test-order-status-04, test-refund-within-limit-04, test-refund-within-limit-05, test-refund-within-limit-10, test-returns-04)

