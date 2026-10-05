# Milestone 5 plan: deploy (draft)

**Status: draft, collecting items. Not agreed yet.** The spec's M5 is "free hosting, the public demo limits, and admin login" (docs/PROJECT.md). The full plan (hosting choice, limits, login, costs) gets written and agreed before M5 starts. The public-demo items already decided are in PROGRESS.md, Milestone 4, "Open items for later".

## Item: the `/ops` overview page (Julian, 2026-10-02)

**Built 2026-10-05** from the mockup Julian approved (https://claude.ai/artifact/Lvwjjp8rXrYM2cHFV5uodU), before the switch/retire decision (gate relaxed by Julian). `/ops/` now opens on it. See docs/history/M5.md, "The /ops overview page". The plan below is kept as written.

`/ops` opens on an overview page instead of an empty Approvals page. It's the first thing a visitor to the public demo sees, so it should be visually distinctive and screenshot-friendly, not a generic dashboard.

### Gates
- **When:** after the M3 test run (`test-1`) and the retire decision, since they give the page its best content: held-out numbers, and a real decision to show.
  - **Order (Julian, 2026-10-02, a spec change):** the retire decision happens right after the `test-1` results and before this page is built. It's no longer in M6. The written case study stays in M6.
- **Mockup or plan first:** show Julian a mockup (or a written layout) and get approval before building.
- **Design:** use the `frontend-design` skill. It isn't installed in this environment as of 2026-10-02, so check at build time and ask Julian how to get it, or what to use instead, if it's still missing.

### Contents
1. **Headline sentence.** One honest sentence about what the system does and how well. For example (the shape, not the numbers): "Three models ran 110 held-out conversations; X led with N% task success, not significantly ahead of Y, and none broke a business rule." It's generated from the data, never written by hand.
2. **3–4 KPI tiles with honest labels.** Each tile names its set and split, shows its interval where it has one, and gives its `n`. Candidates:
   - task success, for the winner or for each model
   - policy violations (the "must be 0" metric)
   - grounding violations
   - p50 turn latency or cost per conversation

   No tile without a source set.
3. **Agent-team diagram with the current models.** The router → shopping / support, with handoffs between them and the model on each role, from the team history in the DB. It updates when a model is switched.
4. **Compact comparison chart with the winner verdict.** Task success per model with 95% intervals (the comparison page's interval bars, smaller), and `pickWinner`'s sentence, including "leads, not significant" when that's the verdict.
5. **The retire decision card.** What was retired or switched, from what to what, the reason, and the numbers it rested on, from `team_changes` and the comparison set. Until a decision exists, the card says so and links to the Agents history. It never shows a placeholder decision.
6. **"Safety by design" facts, each linked to a real trace.** For example:
   - a $179.99 refund queued for approval instead of paid
   - another customer's order refused
   - a prompt-injection refund attempt refused
   - an expired coupon rejected

   **Links go to public eval traces** (`#/evals/<run>/<model>/<case>`). Live traces are admin-only (Julian, 2026-10-02), so they can't be the public evidence.
7. **"What the evals caught".** Real findings from the eval history, each with its run and its fix. Examples already in docs/history/: the $50-split refund bypass (2026-09-29), lenient order-item matching, the cart claim and follow-up promises, garbled replies being held back. Weaknesses stay visible.
8. **Clear next-step links:** try the chat (storefront), the Model comparison, Runs (eval traces), Approvals, and Agents.

### Rules
- **Every number comes from the comparison sets** (`eval-results/comparisons/sets/*.json`, built by `npm run eval:sets` from real runs), shown with its split ("dev: tuned on" vs "test: held out"). The test set is the headline once `test-1` exists; dev numbers are labelled as such.
- Pure functions for everything the page decides (the headline sentence, which tiles, the verdict text), tested in Node like the rest of the dashboard. A test checks that every number on the page traces back to a set file.
- It has to read well in one screenshot at desktop width (for the README and case study) and work at phone width.
