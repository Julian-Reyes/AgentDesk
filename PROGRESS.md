# Progress

## Milestone 1 — Store data + tools ✅ Closed (2026-09-28)

**Store:** Larchgrove Supply Co. (fictional; web search found no business by that name. "Tall Pine Outfitters" and "Cairn" were rejected as real businesses).

### What exists
- **Schema** (`server/src/db/schema.ts`, migrations in `server/drizzle/`): products, variants, promotions, coupons, policies, customers, orders, order items, tracking events, refunds, approvals, escalations.
- **Seed** (`npm run db:seed`): 60 hand-written products (213 size/color variants), 4 promotions (1 expired), 6 coupons, 7 policy docs, 200 customers, 400 orders in every status, 1,749 tracking events. It's deterministic (seeded PRNG, fixed store date `2026-09-15`) and rerunnable.
- **Eval anchors** (`server/src/seed/data.ts`): named customers (Maya Chen, Daniel Okafor, Priya Raman, Tom Becker, Sofia Alvarez) and fixed orders for each scenario: #1042 shipped, #1043 another customer's order, #1050 $29 damaged headlamp, #1051 $179.99 damaged bag, #1052 outside the return window, #1053 worn boots, #1054 lost, #1055 delayed, #1056 processing, #1057 already returned. Also Sofia's goodwill coupon from 10 days ago, and stock anchors (Squall jacket M/green = 3, L/green = 0).
- **Policy layer** (`server/src/policy/`): pure functions for pricing, coupons, refunds, goodwill and returns. All limits live in `rules.ts`.
- **15 tools** (`server/src/tools/`):
  - shopping: `search_products`, `get_product`, `check_stock`, `get_active_promotions`, `validate_coupon`, `quote_price`
  - support: `find_customer`, `get_order`, `get_tracking`, `check_return_eligibility`, `issue_refund`, `issue_goodwill_coupon`, `escalate_to_human`
  - shared: `get_policy`, `reply`
- **Try-tool CLI:** `npm run tool -- list`, or e.g. `npm run tool -- get_order '{"orderId":1042}' --as maya.chen@example.com`.
- **Tests:** 117 passing (`npm test`): 42 pure policy tests, 63 tool tests against the real Postgres test DB (each wrapped in a rolled-back transaction), and 12 seed tests (determinism, totals, dates, historical pricing). A sanity check confirmed the tests catch breakage: raising the refund limit and removing the ownership check made 5 tests fail.

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
- A damaged-item refund can't be tied to a specific item (the spec's `issue_refund` has no item argument); the cap is what's left refundable on the order. The M3 graders should check the amount against the item's `paid` amount from `get_order`.
- A `late` refund is capped at shipping minus *all* earlier refunds on the order, which is conservative.
- Tools mutate the DB (refunds, approvals, coupons, escalations). **M3 eval runs must reset state per conversation** (reseed, or run each conversation in a rolled-back transaction).
- **Decision: price limits mean the price the customer actually pays.** For questions like "best 2-person tent under $200", compare against the sale price (after automatic promotions), not the list price. Eval cases and graders follow this rule.
  - ✅ `search_products` follows this rule (see "search_products uses the current price" below). So "2-person tent under $200" includes the Ridge 2 at $199.20 during the tent sale.
  - ✅ `get_product` does too; see "Consistent product prices" below.
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

### Change after M1 (2026-09-28): search_products uses the current price
Spec change: `minPrice`/`maxPrice` now filter on the **current price**, i.e. what one unit costs today after any active category sale, computed by running one unit through the same pricing engine as `quote_price`. Each result returns `listPrice` and `currentPrice` (the old single `price` field is gone), so the agent can say "was $249.00, now $199.20". The tool description says this. Buy-2-get-1 isn't reflected in `currentPrice`, because it doesn't lower a single unit's price; `quote_price` handles it for carts. The "under $200" test was updated deliberately to include the Ridge 2 at $199.20; this is a spec change, not a weakened test. New tests cover: the filter boundary to the cent ($199.20 in, $199.19 out), `minPrice` using the current price, products not on sale (currentPrice = listPrice), and `currentPrice` matching `quote_price` for one unit of every tent. Switching the filter back to list price makes 3 of them fail.

### Change after M1 (2026-09-28): consistent product prices across all tools
An audit of every tool output that shows a product price found three:
- **`get_product`** returned a single `price` (the list price). It now returns `listPrice` and `currentPrice`, from the same shared `presentProduct()` and `currentPriceCents()` (`server/src/tools/common.ts`) that `search_products` uses. Its description explains both prices.
- **`quote_price`** called the per-unit list price `unitPrice`. It's now `listPrice`; the value is unchanged, and the discount lines and `lineTotal` still show what's paid.
- **`get_order`** showed `unitPrice` (list price at purchase), and the discount existed only at order level. So #1042's tent read "$189.00" when the customer paid $151.20, which could have led to wrong answers and wrong refund amounts. Order lines now store their own discount (new column `order_items.discount_cents`, migration `0001_order_item_discount.sql`, filled by the seed from `quote()`). Each item shows `listPrice` (per unit, at purchase), `discount` and `paid` (for the line), and the tool description says to use `paid` for what the customer spent.

The rest (`validate_coupon`, `get_active_promotions`, `find_customer`, refund and goodwill results) show totals, discounts or refund amounts, not product prices, so they're unchanged.

New tests:
- #1042's per-line `paid` of $151.20
- `get_product` prices, with and without a sale
- `get_product` and `search_products` agreeing on both prices for all 60 products
- line discounts summing to the order discount
- a guard that no tool output uses an ambiguous `price` or `unitPrice` key

Bringing back the old list-only `currentPrice` and the discount-blind `paid` makes 4 tests fail. This also resolves the earlier known gap about damaged-item refund amounts: the M3 graders can check a refund against the item's `paid` amount.

**Milestone 1 is closed.**

## Milestone 2 — Agent loop 🚧 In progress

### Decisions so far (2026-09-29)
- **GitHub Models was retired on 2026-07-30** ([changelog](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/)). The "GPT" slot in the comparison is now **Groq `openai/gpt-oss-120b`** (OpenAI's open-weights GPT). Lineup: Gemini Flash · Groq gpt-oss-120b · Groq qwen3.8-27b · a small local model. Free-tier limits, from official docs only: `docs/FREE_TIERS.md`.
- **Cerebras has no permanent free tier** (a $5 / 30-day trial that needs a card). Julian may switch to paid Cerebras later.
- **The provider is part of every model configuration's identity.** Config ids are `<provider>/<model>` (e.g. `groq/gpt-oss-120b`). The id is recorded in each run's metadata and included in the cache key, so the same model on a different provider (e.g. `cerebras/gpt-oss-120b`) is a separate configuration everywhere, including the comparison.
- **Local models run on the M2 Mac mini (16 GB) on the home network, not on this MacBook.** The MacBook is on macOS 13.7, which the current Ollama build doesn't officially support; it's also short on disk and slow on CPU. The client reaches the Mac mini via `OLLAMA_BASE_URL` in `.env` (default `http://localhost:11434`). Setup steps: `docs/OLLAMA_MAC_MINI.md`. A first test on the MacBook (qwen3.5:4b, ~5.8 tokens/s) was removed afterwards to free ~4.2 GiB.
- **Modal + vLLM will serve the chosen open model for the official eval runs and the public demo. The Mac mini (Ollama) stays for development only.**
  - vLLM exposes an OpenAI-compatible `/v1/chat/completions`, so Modal is just another config entry (e.g. `modal/<model>` with its own `provider`, `baseUrl` and `apiKeyEnv`), with no client changes.
  - Because the provider is part of the config id, `modal/<model>` and `ollama/<model>` are separate configurations. They are genuinely different: Ollama serves a 4-bit GGUF quantization, while vLLM typically serves the original weights (bf16/FP8), with a different tool-call parser. **Reported numbers come from the Modal runs**; Mac mini smoke-test numbers only guide the model choice.
  - **Before any Modal setup:** (1) check Modal's official pricing and free-plan terms and record them in `docs/FREE_TIERS.md`, (2) give Julian a cost estimate for the eval runs and the demo, (3) walk Julian through setting Modal's **usage budget to $30 and spend limit to $0** (no out-of-pocket charges; if Modal won't accept $0, stop and ask). Pricing and free-plan terms were checked on 2026-09-29 (see `docs/FREE_TIERS.md`): $30/month free credit, card required. Not signed up.
- **No OpenAI SDK.** The client is plain `fetch` against `/chat/completions`, so there's no new dependency and the wire format stays visible.

### Done (all tested with the fake provider; no real model has been called yet)
- **Provider layer** (`server/src/llm/`):
  - `config.ts` + `server/config/models.json`: Zod-validated model configs. `baseUrl` can reference env vars (`${OLLAMA_BASE_URL:-http://localhost:11434}/v1`), and `pricing` (USD per million tokens, 0 for free tiers) is used to record cost.
  - `openai-compatible.ts`: one `fetch`-based client for Ollama/Groq/Gemini/vLLM. It retries 429/5xx/network errors (honoring `Retry-After`, else exponential backoff) and fails fast on other 4xx. It normalizes tool calls and the `reasoning` field, and supports JSON response format.
  - `fake.ts`: `FakeProvider` plays back a script of responses and records every request. `fake.tools/reply/text/json` helpers keep scripts short.
  - `cache.ts`: record/replay cache. `LLM_CACHE=off|record|replay` (default `record`); `replay` makes a miss an error, guaranteeing a $0 re-run. The key hashes the config id, **provider**, model, params and the full request (messages, tools, response format). It deliberately leaves out `baseUrl` (moving Ollama to the Mac mini keeps the cache) and never stores keys. Entries go in `server/.llm-cache/<provider>/…` (gitignored for now; committing it later would let anyone re-run evals for free). A replayed response keeps the original latency, so metrics report what the model actually took.
  - `factory.ts`: `createProvider(config)` = the client wrapped in the cache. `costMicros()` records cost as integer micro-dollars.
- **Agents** (`server/src/agents/`):
  - `prompts.ts`: versioned system prompts (router, shopping, support). Traces record `name@version#hash`, so an edit made without a version bump still shows. **The prompts contain no rule numbers**; the tools enforce and explain the rules.
  - `router.ts`: the `Router` interface returns `{route, category, urgency, confidence}` (swappable for ShopRoute later). `LlmRouter` asks for JSON, validates it with Zod (tolerating code fences; unknown categories become `other`), retries once with the error, then **falls back to `clarify`**, never a guess. Routes: `shopping`, `support`, `clarify`, `out_of_scope`.
  - `conversation.ts`: the hand-written loop.
    - The Router runs only when no agent owns the conversation (the first message, or after a clarify/out-of-scope answer). After that, the agent keeps it and can hand it off.
    - Each step: model call → tool calls → results fed back, until the agent calls `reply`.
    - Guardrails in code:
      - Agents only get their own tools (anything else returns `UNKNOWN_TOOL`); arguments are validated with Zod (`INVALID_ARGS`).
      - Every tool call gets a result message (after `reply`, later calls come back `SKIPPED`).
      - Step limit (8) and handoff limit (2 per turn); provider errors become an honest failure reply.
      - A plain-text answer without `reply` is delivered but traced as `implicit`.
    - Handoffs use a loop-level `handoff` tool. The new agent starts from the customer-visible transcript plus a handoff note, not the other agent's tool calls.
    - Outcome per turn and run: `resolved` < `approval_needed` < `escalated` < `failed`. It's derived from tool results (`queued_for_approval`, a successful `escalate_to_human`), not from what the model says.
  - `team.ts` + `server/config/team.json`: which model config each role uses (`MODEL` in `.env` overrides all three). M4 will move this into the DB with a switch/retire history.
- **Tracing** (`server/src/tracing/tracer.ts`, migration `0002_tracing.sql`):
  - `runs` (source, customer, team = model + provider + prompt version per role, labels, outcome, turns, token and cost totals) and `run_steps` (user_message, router, model_call, tool_call, handoff, reply, error; with agent, model config, provider, prompt version, tokens, latency, cached, policy decision, and a JSON payload).
  - No foreign keys to store tables, so traces survive reseeds. `DbTracer` uses its **own connection**, so traces survive the rollback of the tools' transaction (tested), which M3 eval runs need.
  - `MemoryTracer` is used by tests.
- **CLIs:** `npm run chat -- --as maya.chen@example.com` (interactive, traced, runs tools against the dev DB), `npm run trace [-- <run id>]` (lists recent runs or prints one step by step), `npm run smoke -- <config-id>…`.
- **Tests: 174 passing.** Test files are listed below.
  - `llm/cache.test.ts`: key covers provider/params/tools and ignores baseUrl; record/replay/off; errors not cached.
  - `agents/router.test.ts`: valid, fenced and invalid JSON; retry; fallback.
  - `agents/conversation.test.ts`: 20 loop tests with real tools in a rolled-back transaction:
    - $29 refund auto-approved; $179.99 queued; "$500" refused by the tool.
    - Someone else's order returns not-found; escalation; anonymous visitor.
    - Wrong-agent/unknown tools and bad JSON; reply ends the turn; implicit reply.
    - Step limit; provider error; empty response.
    - Handoff context; handoff target; ping-pong limit; multi-turn context.
  - `agents/team.test.ts`
  - `tracing/db-tracer.test.ts`: totals, ordering, and surviving a rollback.
  - **A global test setup replaces `fetch` with one that throws**, so a test can't reach a real API even by accident.
  - Sanity check: removing the allowed-tools check, the handoff limit, or the approval outcome makes 4 tests fail.

### Open items
1. **Local model choice, which must be done before the first full comparison run in M3.** Ollama on the Mac mini (Julian, later): set it up per `docs/OLLAMA_MAC_MINI.md`, then smoke-test qwen3.5:4b (thinking on/off), lfm2.5 8B-A1B and qwen3.5:9b (thinking on/off), asking before each pull. Pick one to keep and delete the rest. The recommendation must confirm **vLLM support** (incl. tool-call parsing), the **official Hugging Face name**, and the **Modal GPU** it needs. `server/config/team.json` points at `ollama/qwen3.5-4b` as a placeholder until then.
2. **First real model calls (needs `GEMINI_API_KEY` and `GROQ_API_KEY` in `.env`):** run `npm run smoke -- groq/gpt-oss-120b groq/qwen3.8-27b gemini/gemini-3.8-flash` (8 calls per model, all free tier), plus a few `npm run chat` conversations. This verifies the client against each real API (JSON mode, tool-call format, reasoning fields), then records the measured tokens per call in `docs/FREE_TIERS.md`. Check that the Gemini model id is still current, and record the account's Gemini limits from AI Studio.
3. **Milestone 2 closes once the cloud models work** (item 2). Item 1 stays at the top of the open items until it's done, and blocks M3's first full comparison run.
