<!--
DRAFT (M6, 2026-10-06). Claude drafts, Julian edits. Sections 1–4 drafted; 5–7 wait for test-2.
Every number has a source note in an HTML comment next to it. Before publishing, check each against the file it names.
Target: ~800 words. Sections 1–4 are budgeted at ~460.
-->

# AgentDesk: a case study

## The problem and the team design

A store's chat mixes easy questions with ones that move money, which makes it a good test for AI agents. AgentDesk serves a fictional outdoor-gear store. A **router** sends each conversation to a **shopping agent** (products, prices, coupons) or an **orders and returns agent** (tracking, refunds, damaged items), and the two can hand off to each other. Each agent gets only its own tools, enforced by the loop rather than the prompt, so the shopping agent can't issue a refund. The loop is hand-written TypeScript with no framework, and every step is traced.

## Why the rules live in code

Every business rule is enforced by a tool, never only by a prompt. Refunds up to $50 are paid automatically, larger ones wait for a person, <!-- source: server/src/policy/rules.ts --> and customers see only their own orders. The policy text the agents read is generated from the same constants, so it can't promise what the code won't do.

The held-out test showed where this wasn't enough. Two models refunded a headlamp the customer said they had *dropped*, calling it "damaged". <!-- source: docs/history/M3.md, "test-1 results", policy violations 1 and 2 --> The $50 limit held, but the code trusted the model's reason. So the reason became a rule: a damaged refund must say when the damage happened, and only damage on arrival is refunded. Afterwards, on the development cases, neither model refunded any of the 6 lamps that were dropped or failed after use. <!-- source: docs/history/M3.md, "dev-dmg finished" (0/6 for each model) --> When one model guessed which item had broken instead of asking, the fix again went into code: a damaged refund is only for an item the customer has named. [TODO after test-2: what the guard did on the test set.]

## How grounding is checked

Invented products, prices or specs are the headline safety metric, and a code checker reads every reply for them. Each dollar amount must come from a tool result or a named product's catalog price; a total the model computed itself counts as invented, even when it's right. Specs must match the catalog, allowing unit conversions ("4.2 lb" for 1,900 g). Its end-to-end test caught a bug before the first run: each reply counted as evidence for itself, so nothing would ever have been flagged. <!-- source: docs/history/M3.md, "Step 3: graders and the grounding checker" -->

## The eval method and judge validation

I reviewed all 153 eval conversations: 43 for development, which I tuned the prompts on, and 110 held out and never tuned on. <!-- source: PROGRESS.md, "Eval sets"; server/src/evals/cases/ --> Each case states its expected route, tools, refunds and coupons, and a validator recomputes every expected amount with the store's own policy code. It caught mistakes in the cases too, such as one that failed a correct run. <!-- source: docs/history/M3.md, "dev-dmg finished" -->

Code grades what code can check. An LLM judge (gpt-oss-20b) answers only the yes/no questions code can't, such as "does the reply promise a follow-up the agent can't do?", and scores tone, clarity and helpfulness. Rates carry 95% Wilson intervals. I graded 30 replies blind, and the judge's yes/no answers agreed with mine 95% of the time (77 of 81, 88–98%; an earlier rubric version). <!-- source: server/eval-results/judge-check/dev-1/agreement.md (rubric@2) --> It scores bad replies too generously, so pass/fail comes from the checks, not the scores.

## The model comparison

[After test-2: Flash-Lite and gpt-oss-120b on round 3; Qwen's test-1 column, labelled. The no-winner rule. The drop from dev to test. Latency and cost. ~120 words.]

## What failed and what I changed

[After test-2, ~150 words: lenient item matching; raw tool syntax in a reply; gpt-oss's follow-up promises; the grader-side case bug.]

## The retirement decision

[~70 words: Qwen retired from the shopping role on 2026-10-05, Julian's reason, the test-1 shopping numbers (59% vs 78% and 83%), why no winner was declared; anything decided after test-2.]

---

*Limits and what's next: the public site is a static snapshot; live chat is planned as Milestone 7 and a small open model as Milestone 8.*
