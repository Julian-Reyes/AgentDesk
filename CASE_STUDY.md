<!--
DRAFT (M6, 2026-10-06). Claude drafts, Julian edits. All sections drafted.
Every number has a source note in an HTML comment next to it. Before publishing, check each against the file it names.
Target: ~800 words.
-->

# AgentDesk: a case study

## The problem and the team design

A store's chat mixes easy questions with ones that move money, which makes it a good test for AI agents. AgentDesk serves a fictional outdoor-gear store. A **router** sends each conversation to a **shopping agent** (products, prices, coupons) or an **orders and returns agent** (tracking, refunds, damaged items), and the two can hand off to each other. Each agent gets only its own tools, enforced by the loop rather than the prompt, so the shopping agent can't issue a refund. The loop is hand-written TypeScript with no framework, and every step is traced.

## Why the rules live in code

Every business rule is enforced by a tool, never only by a prompt. Refunds up to $50 are paid automatically, larger ones wait for a person, <!-- source: server/src/policy/rules.ts --> and customers see only their own orders. The policy text the agents read is generated from the same constants, so it can't promise what the code won't do.

The first test run showed where that wasn't enough: two models refunded a headlamp the customer had *dropped*, calling it "damaged". <!-- source: docs/history/M3.md, "test-1 results" --> The $50 limit held, but the code trusted the model's reason. Now a damaged refund must say when the damage happened, and only damage on arrival is refunded: such refunds went from 3 of 4 test conversations to 0 of 4. <!-- source: docs/history/M6.md, "test-2 results" --> The cause is still the model's word, though, and gpt-oss once got it wrong on dev. <!-- source: docs/history/M6.md, "The dev check" (1 of 12) --> When Flash-Lite guessed which item had broken, the fix again went into code: a damaged refund is only for an item the customer named.

## How grounding is checked

Invented products, prices or specs are the headline safety metric, and a code checker reads every reply for them. Each dollar amount must come from a tool result or a named product's catalog price; a total the model computed itself counts as invented, even when it's right. Specs must match the catalog, allowing unit conversions ("4.2 lb" for 1,900 g). Its end-to-end test caught a bug before the first run: each reply counted as evidence for itself, so nothing would ever have been flagged. <!-- source: docs/history/M3.md, "Step 3: graders and the grounding checker" -->

## The eval method and judge validation

I reviewed all 153 eval conversations: 43 for development, which I tuned the prompts on, and 110 held out and never tuned on. <!-- source: PROGRESS.md, "Eval sets"; server/src/evals/cases/ --> Each case states its expected route, tools, refunds and coupons, and a validator recomputes every expected amount with the store's own policy code. It catches mistakes in the cases too. <!-- source: docs/history/M3.md, "dev-dmg finished" -->

Code grades what code can check. An LLM judge (gpt-oss-20b) answers only the yes/no questions code can't, such as "does the reply promise a follow-up the agent can't do?", and scores tone, clarity and helpfulness. Rates carry 95% Wilson intervals. I graded 30 replies blind, and the judge's yes/no answers agreed with mine 95% of the time (77 of 81, 88–98%; an earlier rubric version). <!-- source: server/eval-results/judge-check/dev-1/agreement.md (rubric@2) --> It scores bad replies too generously, so pass/fail comes from the checks, not the scores.

## The model comparison

On the 110 held-out cases, Flash-Lite passed 78% (69–85%) and gpt-oss-120b 63% (53–71%) after the fixes; Qwen3.8-27B, measured only before them, 65%. <!-- source: server/eval-results/runs/test-2/report.md; server/eval-results/runs/test-1/report.md --> The comparison only highlights a model with zero policy violations, and only calls it a winner if its interval clears the runner-up's. Flash-Lite leads, but not significantly. Two identical dev runs moved one model's score by 13 points, <!-- source: dev-3-r2a and dev-3-r2b reports (gpt-oss 75% vs 62%) --> so I don't credit the fixes with Flash-Lite's gain or blame them for gpt-oss's drop. Every model scored lower on held-out cases than on the dev cases I tuned on: Flash-Lite 85% → 72% on the first test run. <!-- source: docs/history/M3.md, "test-1 results" --> The paid tier cost $0.37 for 110 Flash-Lite conversations. <!-- source: server/eval-results/runs/test-2/report.md -->

## What failed and what I changed

A garbled item name was accepted for a refund, so item matching became strict. A reply showed raw tool syntax to a customer and my graders missed it; both the live check and the grader now catch it. gpt-oss still promises follow-ups no tool can do, in 4 of 110 test conversations. <!-- source: server/eval-results/runs/test-2 (eval:compare test-1 test-2) -->

Some failures were mine. Two split refunds that paid exactly the right total counted as violations; refunds are now graded per order. And when a customer asked for a 25% coupon, both models issued 10% instead of asking a person to approve 25%. I had graded that as a policy violation, but the rule lived only in my grader: the agents were never told, and the 10% stayed within every limit enforced in code. It's now a failed task, and the tool tells agents to request the customer's amount (not yet measured). <!-- source: docs/history/M6.md, "A lowered coupon is a task failure" --> A rule the agents aren't told and the code doesn't enforce isn't a rule.

## The retirement decision

After the first test run, I retired Qwen from the shopping role as the worst performer: 59% (43–72%) on shopping cases, against 78% for Flash-Lite and 83% for gpt-oss. <!-- source: server/eval-results/runs/test-1/report.md --> Flash-Lite now runs all three roles. Re-grading the coupon left Qwen as that run's only model without a policy violation, but still the lowest scorer; I haven't changed the decision. Flash-Lite's later lead isn't significant, so I made no further switch.

---

*Limits and what's next: the public site is a static snapshot; live chat and more models are planned for Milestone 7, and a small open model for Milestone 8.*
