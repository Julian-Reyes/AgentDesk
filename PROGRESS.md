# Progress

## Milestone 1 — Store data + tools ✅ (2026-09-28)

**Store:** Larchgrove Supply Co. (fictional; web search found no business by that name. "Tall Pine Outfitters" and "Cairn" were rejected as real businesses).

### What exists
- **Schema** (`server/src/db/schema.ts`, migration `server/drizzle/0000_init.sql`): products, variants, promotions, coupons, policies, customers, orders, order items, tracking events, refunds, approvals, escalations.
- **Seed** (`npm run db:seed`): 60 hand-written products (213 size/color variants), 4 promotions (1 expired), 6 coupons, 7 policy docs, 200 customers, 400 orders in every status, 1,749 tracking events. It's deterministic (seeded PRNG, fixed store date `2026-09-15`) and rerunnable.
- **Eval anchors** (`server/src/seed/data.ts`): named customers (Maya Chen, Daniel Okafor, Priya Raman, Tom Becker, Sofia Alvarez) and fixed orders for each scenario: #1042 shipped, #1043 another customer's order, #1050 $29 damaged headlamp, #1051 $179.99 damaged bag, #1052 outside the return window, #1053 worn boots, #1054 lost, #1055 delayed, #1056 processing, #1057 already returned. Also Sofia's goodwill coupon from 10 days ago, and stock anchors (Squall jacket M/green = 3, L/green = 0).
- **Policy layer** (`server/src/policy/`): pure functions for pricing, coupons, refunds, goodwill and returns. All limits live in `rules.ts`.
- **15 tools** (`server/src/tools/`):
  - shopping: `search_products`, `get_product`, `check_stock`, `get_active_promotions`, `validate_coupon`, `quote_price`
  - support: `find_customer`, `get_order`, `get_tracking`, `check_return_eligibility`, `issue_refund`, `issue_goodwill_coupon`, `escalate_to_human`
  - shared: `get_policy`, `reply`
- **Try-tool CLI:** `npm run tool -- list`, or e.g. `npm run tool -- get_order '{"orderId":1042}' --as maya.chen@example.com`.
- **Tests:** 108 passing (`npm test`): 42 pure policy tests, 55 tool tests against the real Postgres test DB (each wrapped in a rolled-back transaction), and 11 seed tests (determinism, totals, dates, historical pricing). A sanity check confirmed the tests catch breakage: raising the refund limit and removing the ownership check made 5 tests fail.

### Key decisions (and why)
1. **Money is in integer cents, formatted strings go to the model.** Floats drift, and models mis-convert cents. Tools accept dollars (`amount: 29.99`) and return `"$29.99"`, so the model never does any arithmetic.
2. **Rules are pure functions, separate from the tools**, so each rule exists in one place and is tested without a DB.
3. **Policy docs are generated from the same constants the code enforces**, so the text can't promise what the code won't do. A test checks this.
4. **The app sets the customer's identity (`ctx.session`), never the model.** Someone else's order returns the exact same `ORDER_NOT_FOUND` as a nonexistent one, so order numbers can't be probed.
5. **The $50 auto-refund limit is cumulative per order** (issued + pending + this one), so it can't be dodged by splitting a big refund into small ones. `issue_refund` locks the order row (`FOR UPDATE`) so concurrent calls can't race past the limits either.
6. **Changed from the plan:** agents can't refund with reason `return`. `issue_refund` has no item argument, so a "return" refund could have been issued for a worn item. Returns now go through eligibility → ship back → warehouse refunds on receipt (this is how the seed's returned orders are refunded). Agent refund reasons: `damaged` (≤ 14 days), `lost`, `late` (shipping only).
7. **Fixed store clock** (`STORE_DATE`), so return windows and coupon expiries don't drift and eval expectations stay valid.
8. **Deterministic tool outputs** (e.g. goodwill codes are `SORRY-<customer>-<date>`, not random), so the M2 record/replay cache gets hits.
9. **Search is filtered in memory.** With 60 products, that's simpler and fast enough. A real catalog would use SQL / full-text search.
10. **Postgres.app instead of Homebrew Postgres:** Homebrew had no prebuilt package for macOS 13 on Intel and was compiling everything from source (1–2+ hours).

### Known gaps / notes for later
- Seeded orders don't use coupons (only automatic promotions are applied; see the fix below).
- A damaged-item refund can't be tied to a specific item (the spec's `issue_refund` has no item argument); the cap is what's left refundable on the order. The M3 graders should check the amount against the item price.
- A `late` refund is capped at shipping minus *all* earlier refunds on the order, which is conservative.
- Tools mutate the DB (refunds, approvals, coupons, escalations). **M3 eval runs must reset state per conversation** (reseed, or run each conversation in a rolled-back transaction).
- **Decision: price limits mean the price the customer actually pays.** For questions like "best 2-person tent under $200", compare against the sale price (after automatic promotions), not the list price. Eval cases and graders follow this rule.
  - ⚠️ **Open, fix before M3:** `search_products`' `minPrice`/`maxPrice` filters still use **list** price, and the test "finds 2-person tents under $200" encodes that. Under the rule above, the Ridge 2 ($249.00 list, $199.20 during the tent sale) should also match. The filter should compare against the sale price, and the test should change with it.
- `npm audit` reports 4 moderate issues in an old esbuild bundled inside drizzle-kit (dev only; the risk affects esbuild's dev server, which we never run). `audit fix --force` would downgrade drizzle-kit to 0.18, so it's left as is.
- Approving or rejecting items in the approvals queue (and creating the refund or coupon on approval) belongs to M4.

### How to run
```sh
cp .env.example .env            # Postgres.app on localhost:5432
createdb switchyard_dev && createdb switchyard_test   # Postgres.app's bin dir
npm install
npm run db:migrate && npm run db:seed
npm test && npm run typecheck
```

### Fix after M1 (2026-09-28): seeded orders ignored promotions
Seeded orders were priced at list price even when placed during a sale. For example, #1042 (Canopy 2 tent, placed Sep 12 during the Sep 5 – Oct 5 tent sale) was charged $189.00 instead of $151.20, and 16 orders in total were overcharged (13 during the tent sale, 3 during the stove sale). Seed orders are now priced by the same `quote()` engine as live quotes, using the promotions active at each order's `placedAt` (the shared `activePromotionsAt()` in `server/src/policy/promotions.ts`, also used by the tools). Refunds for returned orders now equal what was paid for the goods (after discounts) rather than the list-price subtotal. New seed tests check every stored total against `quote()` using the DB rows, check #1042's exact amounts, and check discount presence inside and outside the sale windows. Four of them fail against the old list-price seeding. The 21 orders in the headlamp buy-2-get-1 window correctly have no discount, since none has more than 2 headlamps.

## Next: Milestone 2 — Agent loop
The provider client (cloud + Ollama), the hand-written loop, the router + 2 agents with handoffs, tracing, the fake provider, and the record/replay cache. First steps: check free-tier limits and record them in `docs/FREE_TIERS.md`, and propose 2–3 Ollama models for approval before downloading.
