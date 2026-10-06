# Milestone 6 plan: the story

Agreed with Julian on 2026-10-06. **Status: Milestone 6 closed 2026-10-06** (`docs/history/M6.md`, "Milestone 6 closed"); the GIF, the phone check, the Approvals-notes decision and Julian's case-study edit are carried. Spec: `docs/PROJECT.md` ("Deliverables", milestone 6: final comparison runs, README, case study, polish). Detailed record: `docs/history/M6.md`.

## Julian's decisions (2026-10-06)
- **M5 closed first** (done 2026-10-06), its small leftovers carried into the polish step here.
- **`test-2` runs on two models now:** Flash-Lite and gpt-oss-120b. Qwen keeps its `test-1` result, labelled as from before round 3; rerun it only after Groq's budget resets (it's retired from the shopping role anyway).
- **The case study:** Claude drafts, Julian edits.

## 1. Round 3
- **The `issue_refund` item guard** (design in M3 history, "Julian's decisions on `dev-dmg`"): on an order with more than one item, a damaged refund only for an item the customer named in their own messages; otherwise "ask the customer which item". Code, tests, and the same check in the case validator.
- **Prompt changes: none.** The agents keep the round-2 prompts. Only `issue_refund`'s description gains one clause about the guard. gpt-oss's follow-up promises stay a documented weakness; a prompt fix would need Julian's review of the wording first. (After `test-2`, Julian also added one sentence to `issue_goodwill_coupon`'s description, not measured.)
- **Dev check, `dev-r3`:** the full dev set once, plus the 6 damage cases twice more (`dev-r3-dmg-1`, `-2`), on Flash-Lite and gpt-oss-120b. Cost estimate before running.

## 2. `test-2`
The 110 test cases on Flash-Lite and gpt-oss-120b, round 3 (the guard, the damage-cause rule, catching tool calls written as text), judged by gpt-oss-20b `rubric@4`. About $0.45 (`test-1`: gpt-oss agents $0.14, judge ≈ $0.46 for 330 conversations). It takes most of Flash-Lite's daily quota, so it starts after 04:00 and resumes the next day if stopped.

**Budget:** ≈ $6.85 spent of the $8 Groq cycle; round 3's dev check (≈ $0.20) and `test-2` (≈ $0.45) bring it to ≈ $7.50.

## 3. Decisions and the site
Julian's switch/retire decisions on `test-2` (Agents page), then re-export and push the site.

## 4. README
- Results from `test-2` (Qwen's column from `test-1`, labelled), and the before/after for the damage-cause rule and the item guard.
- The GIF (Julian records it).
- Fix quality intervals that go past 5 (clamp or a bounded method), then re-generate the reports.

## 5. `CASE_STUDY.md` (~800 words)
Seven sections from the spec, with word budgets:
1. The problem and the team design (~100)
2. Why the rules live in code (~130): the dropped-lamp refunds in `test-1` → the damage-cause rule (0 of 6 on dev afterwards); Flash-Lite's guessing → the item guard; policy text generated from the same constants
3. How grounding is checked (~90)
4. The eval method and judge validation (~140): 43 dev / 110 frozen test, the case validator, code graders first, Wilson intervals, Julian's blind 30 (95%), the judge's weakness on weak replies
5. The model comparison (~120)
6. What failed and what I changed (~150): lenient item matching, raw tool syntax in a reply, gpt-oss's follow-up promises, a grader-side bug (the `approval_needed` case)
7. The retirement decision (~70)

Closing line: limits and what's next (static snapshot; live chat is M7; the small open model is M8).

- **Sections 1–4 are drafted first** (their facts are settled); 5–7 after `test-2`.
- **Every number carries a hidden source note** (`<!-- source: server/eval-results/runs/… -->`), so each one can be checked against a real run.
- First person, as Julian. He edits.

## 6. Polish
- The site at phone width; the recordings playing in a browser.
- Whether the Approvals page's model-written notes are admin-only (Julian).
- Link the case study from the overview page.

## Close
PROGRESS.md and `docs/history/M6.md` updated, committed, site re-exported and pushed.
