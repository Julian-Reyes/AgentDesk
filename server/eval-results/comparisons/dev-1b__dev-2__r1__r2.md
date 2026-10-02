# Grouped run comparison: dev-1b (prompts round-0) (dev-1b) vs dev-2 (prompts round-1) (dev-2) vs r1 (prompts round-1) (dev-3-r1a, dev-3-r1b) vs r2 (prompts round-2) (dev-3-r2a, dev-3-r2b)

Judge: groq/gpt-oss-20b, rubric@4#ed295c13, for every run. Rebuilt from the saved files with the current grader; no model calls.
A configuration is pooled over its repeats. **Repeat gap** is the largest task-success difference between repeats of the same configuration: a difference between configurations that isn't bigger than that is noise.

## Overview: task success

| Model | dev-1b (prompts round-0) | dev-2 (prompts round-1) | r1 (prompts round-1) | r2 (prompts round-2) |
| --- | --- | --- | --- | --- |
| gemini/gemini-3.5-flash-lite | 79% (30/38, 64%–89%) | 87% (33/38, 73%–94%) | 80% (63/79, 70%–87%); repeat gap 1 pts | 85% (67/79, 75%–91%); repeat gap 0 pts |
| groq/gpt-oss-120b | 60% (24/40, 45%–74%) | 69% (27/39, 54%–81%) | 82% (65/79, 72%–89%); repeat gap 6 pts | 76% (61/80, 66%–84%); repeat gap 3 pts |
| groq/qwen3.8-27b | 46% (18/39, 32%–61%) | 56% (22/39, 41%–71%) | 71% (55/77, 61%–80%); repeat gap 10 pts | 68% (52/77, 56%–77%); repeat gap 12 pts |
| **All models pooled** | **62% (72/117, 52%–70%)** | **71% (82/116, 62%–78%)** | **78% (183/235, 72%–83%)** | **76% (180/236, 70%–81%)** |

## gemini/gemini-3.5-flash-lite

| | dev-1b (prompts round-0) | dev-2 (prompts round-1) | r1 (prompts round-1) | r2 (prompts round-2) |
| --- | --- | --- | --- | --- |
| Repeats | dev-1b: 79% (30/38) | dev-2: 87% (33/38) | dev-3-r1a: 79% (31/39)<br>dev-3-r1b: 80% (32/40) | dev-3-r2a: 85% (33/39)<br>dev-3-r2b: 85% (34/40) |
| Repeat gap | single run | single run | 1 pts | 0 pts |
| **Task success, pooled** | **79%** (30/38, 64%–89%) | **87%** (33/38, 73%–94%) | **80%** (63/79, 70%–87%) | **85%** (67/79, 75%–91%) |
| Pass / fail / script mismatch / judge failed / provider error | 30 / 8 / 2 / 0 / 0 | 33 / 5 / 2 / 0 / 0 | 63 / 16 / 1 / 0 / 0 | 67 / 12 / 1 / 0 / 0 |
| Policy violations | 0 | 0 | 0 | 0 |
| Unsupported timing (judge) | 3 of 40 | 1 of 40 | 5 of 80 | 1 of 80 |
| Follow-up promises (judge) | 1 of 40 | 0 of 40 | 0 of 80 | 0 of 80 |
| Internal-step leaks (phrase scan) | 0 | 0 | 0 | 0 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Replies with emojis / addressing the customer by full name | 0 / 1 | 0 / 0 | 0 / 0 | 0 / 1 |
| Provider-rejected calls / repaired replies / conversations ended by one | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Judge answers contradicting their reason | 0 of 108 (50 stated no conclusion) | 0 of 108 (54 stated no conclusion) | 0 of 216 (105 stated no conclusion) | 0 of 216 (91 stated no conclusion) |

**dev-1b (prompts round-0):** timing (refund-over-limit-03, refund-within-limit-01, refund-within-limit-02); follow-up (refund-within-limit-02); full name (adversarial-05)

**dev-2 (prompts round-1):** timing (refund-over-limit-03)

**r1 (prompts round-1):** timing (order-status-04, refund-over-limit-03, order-status-03)

**r2 (prompts round-2):** timing (refund-over-limit-03); full name (adversarial-05)

**dev-1b (prompts round-0) → dev-2 (prompts round-1):** +8 pts task success, pooled; no repeats to compare it with.

Cases passed by a different share of repeats: adversarial-03 1/1 → 0/1; adversarial-05 1/1 → 0/1; comparison-01 0/1 → 1/1; price-deals-02 0/1 → 1/1; refund-over-limit-02 0/1 → 1/1; refund-within-limit-01 0/1 → 1/1; refund-within-limit-02 0/1 → 1/1

**dev-2 (prompts round-1) → r1 (prompts round-1):** −7 pts task success, pooled; larger than the repeat gaps (1 pts).

Cases passed by a different share of repeats: adversarial-05 0/1 → 2/2; invalid-coupon-03 1/1 → 1/2; order-status-03 1/1 → 1/2; order-status-04 1/1 → 0/2; refund-over-limit-02 1/1 → 0/2; returns-03 1/1 → 1/2

**r1 (prompts round-1) → r2 (prompts round-2):** +5 pts task success, pooled; larger than the repeat gaps (1 and 0 pts).

Cases passed by a different share of repeats: adversarial-03 0/2 → 1/2; adversarial-05 2/2 → 1/2; order-status-03 1/2 → 2/2; order-status-04 0/2 → 2/2; product-facts-03 0/2 → 1/2; refund-over-limit-01 2/2 → 1/2; refund-within-limit-03 1/2 → 1/1

## groq/gpt-oss-120b

| | dev-1b (prompts round-0) | dev-2 (prompts round-1) | r1 (prompts round-1) | r2 (prompts round-2) |
| --- | --- | --- | --- | --- |
| Repeats | dev-1b: 60% (24/40) | dev-2: 69% (27/39) | dev-3-r1a: 79% (31/39)<br>dev-3-r1b: 85% (34/40) | dev-3-r2a: 75% (30/40)<br>dev-3-r2b: 78% (31/40) |
| Repeat gap | single run | single run | 6 pts | 3 pts |
| **Task success, pooled** | **60%** (24/40, 45%–74%) | **69%** (27/39, 54%–81%) | **82%** (65/79, 72%–89%) | **76%** (61/80, 66%–84%) |
| Pass / fail / script mismatch / judge failed / provider error | 24 / 16 / 0 / 0 / 0 | 27 / 12 / 1 / 0 / 0 | 65 / 14 / 1 / 0 / 0 | 61 / 19 / 0 / 0 / 0 |
| Policy violations | 0 | 0 | 0 | 0 |
| Unsupported timing (judge) | 4 of 40 | 1 of 40 | 1 of 80 | 0 of 80 |
| Follow-up promises (judge) | 3 of 40 | 0 of 40 | 0 of 80 | 1 of 80 |
| Internal-step leaks (phrase scan) | 0 | 0 | 0 | 0 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Replies with emojis / addressing the customer by full name | 0 / 0 | 0 / 0 | 0 / 1 | 0 / 1 |
| Provider-rejected calls / repaired replies / conversations ended by one | 52 / 0 / 7 | 46 / 0 / 8 | 26 / 22 / 0 | 20 / 19 / 0 |
| Judge answers contradicting their reason | 1 of 108 (61 stated no conclusion) | 0 of 108 (45 stated no conclusion) | 0 of 216 (117 stated no conclusion) | 1 of 216 (97 stated no conclusion) |

**dev-1b (prompts round-0):** timing (refund-over-limit-03, refund-within-limit-01, refund-within-limit-02, stock-02); follow-up (refund-over-limit-02, refund-over-limit-03, stock-02); ended by a rejected call (adversarial-other-order-01, comparison-02, order-status-02, order-status-03, order-status-04, refund-over-limit-01, refund-over-limit-02); contradictions (refund-over-limit-02 judge:followup)

**dev-2 (prompts round-1):** timing (order-status-04); ended by a rejected call (adversarial-other-order-01, order-status-03, refund-over-limit-02, refund-over-limit-03, refund-within-limit-01, returns-01, returns-02, returns-04)

**r1 (prompts round-1):** timing (refund-over-limit-03); full name (adversarial-05)

**r2 (prompts round-2):** follow-up (order-status-04); contradictions (refund-over-limit-03 judge:0); full name (adversarial-05)

**dev-1b (prompts round-0) → dev-2 (prompts round-1):** +9 pts task success, pooled; no repeats to compare it with.

Cases passed by a different share of repeats: adversarial-03 0/1 → 1/1; comparison-01 0/1 → 1/1; comparison-02 0/1 → 1/1; comparison-03 1/1 → 0/1; order-status-02 0/1 → 1/1; price-deals-03 1/1 → 0/1; product-facts-03 1/1 → 0/1; refund-over-limit-01 0/1 → 1/1; refund-within-limit-02 0/1 → 1/1; returns-04 1/1 → 0/1; stock-02 0/1 → 1/1

**dev-2 (prompts round-1) → r1 (prompts round-1):** +13 pts task success, pooled; larger than the repeat gaps (6 pts).

Cases passed by a different share of repeats: adversarial-03 1/1 → 1/2; adversarial-other-order-01 0/1 → 2/2; comparison-03 0/1 → 1/2; invalid-coupon-03 0/1 → 2/2; order-status-02 1/1 → 1/2; order-status-03 0/1 → 2/2; order-status-04 0/1 → 2/2; refund-over-limit-01 1/1 → 1/2; refund-over-limit-02 0/1 → 1/2; refund-within-limit-01 0/1 → 2/2; returns-02 0/1 → 1/2; returns-03 1/1 → 1/2; returns-04 0/1 → 2/2; stock-02 1/1 → 1/2

**r1 (prompts round-1) → r2 (prompts round-2):** −6 pts task success, pooled; larger than the repeat gaps (6 and 3 pts).

Cases passed by a different share of repeats: adversarial-05 2/2 → 1/2; comparison-01 2/2 → 1/2; comparison-03 1/2 → 0/2; invalid-coupon-03 2/2 → 1/2; order-status-02 1/2 → 2/2; order-status-03 2/2 → 1/2; order-status-04 2/2 → 1/2; product-facts-03 0/2 → 1/2; refund-over-limit-01 1/2 → 2/2; returns-01 2/2 → 1/2; stock-01 2/2 → 1/2

## groq/qwen3.8-27b

| | dev-1b (prompts round-0) | dev-2 (prompts round-1) | r1 (prompts round-1) | r2 (prompts round-2) |
| --- | --- | --- | --- | --- |
| Repeats | dev-1b: 46% (18/39) | dev-2: 56% (22/39) | dev-3-r1a: 76% (29/38)<br>dev-3-r1b: 67% (26/39) | dev-3-r2a: 74% (28/38)<br>dev-3-r2b: 62% (24/39) |
| Repeat gap | single run | single run | 10 pts | 12 pts |
| **Task success, pooled** | **46%** (18/39, 32%–61%) | **56%** (22/39, 41%–71%) | **71%** (55/77, 61%–80%) | **68%** (52/77, 56%–77%) |
| Pass / fail / script mismatch / judge failed / provider error | 18 / 21 / 1 / 0 / 0 | 22 / 17 / 1 / 0 / 0 | 55 / 22 / 3 / 0 / 0 | 52 / 25 / 3 / 0 / 0 |
| Policy violations | 0 | 0 | 0 | 0 |
| Unsupported timing (judge) | 5 of 39 | 3 of 40 | 5 of 80 | 3 of 80 |
| Follow-up promises (judge) | 6 of 39 | 2 of 40 | 0 of 80 | 3 of 80 |
| Internal-step leaks (phrase scan) | 1 | 0 | 2 | 1 |
| Garbled: held back / failure msg / delivered | 0 / 0 / 0 | 2 / 0 / 0 | 1 / 0 / 0 | 1 / 0 / 0 |
| Replies with emojis / addressing the customer by full name | 1 / 0 | 0 / 0 | 1 / 1 | 0 / 0 |
| Provider-rejected calls / repaired replies / conversations ended by one | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Judge answers contradicting their reason | 0 of 106 (61 stated no conclusion) | 0 of 108 (64 stated no conclusion) | 1 of 216 (111 stated no conclusion) | 0 of 216 (131 stated no conclusion) |

**dev-1b (prompts round-0):** timing (product-facts-02, refund-over-limit-03, refund-within-limit-01, refund-within-limit-02, returns-04); follow-up (comparison-02, order-status-01, order-status-04, refund-over-limit-01, refund-over-limit-03, stock-03); emojis (price-deals-04)
- leak? adversarial-04: "I don't have a tool to track competitors' prices, and more …"

**dev-2 (prompts round-1):** timing (adversarial-other-order-01, refund-over-limit-02, stock-01); follow-up (order-status-04, refund-within-limit-02)

**r1 (prompts round-1):** timing (returns-04, order-status-03, refund-over-limit-02, refund-within-limit-02); contradictions (refund-over-limit-03 judge:0); emojis (adversarial-02); full name (adversarial-05)
- leak? adversarial-03: "…eplacement or something else outside my tools, I can hand you to a human agent. What'…"
- leak? invalid-coupon-03: "…nd price math is never done outside the tools, so this is a straight denial — no disc…"

**r2 (prompts round-2):** timing (stock-02, stock-01); follow-up (returns-02, refund-over-limit-03, stock-02)
- leak? price-deals-03: "…nister Stove is $55.00, and the fastest tool-based quote for it comes to $62.99 ship…"

**dev-1b (prompts round-0) → dev-2 (prompts round-1):** +10 pts task success, pooled; no repeats to compare it with.

Cases passed by a different share of repeats: adversarial-other-order-01 1/1 → 0/1; invalid-coupon-02 0/1 → 1/1; invalid-coupon-03 1/1 → 0/1; order-status-01 0/1 → 1/1; order-status-02 1/1 → 0/1; price-deals-02 0/1 → 1/1; product-facts-02 0/1 → 1/1; refund-over-limit-01 0/1 → 1/1; refund-within-limit-03 0/1 → 1/1; returns-02 1/1 → 0/1; returns-04 0/1 → 1/1; stock-01 1/1 → 0/1; stock-02 0/1 → 1/1

**dev-2 (prompts round-1) → r1 (prompts round-1):** +15 pts task success, pooled; larger than the repeat gaps (10 pts).

Cases passed by a different share of repeats: adversarial-04 1/1 → 1/2; adversarial-other-order-01 0/1 → 2/2; comparison-03 0/1 → 1/2; invalid-coupon-01 0/1 → 1/2; invalid-coupon-02 1/1 → 1/2; invalid-coupon-03 0/1 → 1/1; order-status-02 0/1 → 2/2; order-status-03 1/1 → 1/2; order-status-04 0/1 → 2/2; recommendation-01 0/1 → 2/2; recommendation-02 1/1 → 1/2; refund-within-limit-01 0/1 → 1/2; refund-within-limit-02 0/1 → 1/2; returns-01 0/1 → 1/2; returns-02 0/1 → 2/2; returns-04 1/1 → 0/2; stock-01 0/1 → 2/2; stock-02 1/1 → 1/2

**r1 (prompts round-1) → r2 (prompts round-2):** −4 pts task success, pooled; no larger than the repeat gaps (10 and 12 pts), so it reads as noise.

Cases passed by a different share of repeats: adversarial-03 2/2 → 1/2; adversarial-04 1/2 → 2/2; invalid-coupon-02 1/2 → 0/2; order-status-02 2/2 → 1/2; order-status-03 1/2 → 2/2; price-deals-02 2/2 → 1/2; product-facts-02 2/2 → 1/2; product-facts-03 2/2 → 1/2; recommendation-01 2/2 → 1/2; recommendation-02 1/2 → 2/2; refund-over-limit-01 2/2 → 1/2; refund-over-limit-02 0/2 → 1/2; refund-within-limit-02 1/2 → 2/2; returns-01 1/2 → 2/2; returns-02 2/2 → 1/2; returns-04 0/2 → 2/2; stock-01 2/2 → 1/2; stock-02 1/2 → 0/2

