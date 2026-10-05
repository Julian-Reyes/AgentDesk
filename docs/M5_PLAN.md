# Milestone 5 plan: deploy

**Status: proposed 2026-10-05, waiting for Julian's decisions (marked ❓).** The spec's M5 covers:
- the real switch/retire decision (first)
- free hosting
- the public demo limits
- admin login
- the `/ops` overview page (built; see the last section)

Free-tier terms were checked 2026-10-05 and recorded in `docs/FREE_TIERS.md`.

## 1. Hosting (all $0, no card anywhere)

| Piece | Choice | Free terms (checked 2026-10-05) | Why |
| --- | --- | --- | --- |
| Postgres | **Neon** free plan | 100 CU-hours/project/month, 1 GB storage, 5 GB egress, scales to zero after 5 min; at a limit it **suspends, never bills** | Render's free Postgres **expires after 30 days**; Supabase **pauses after 7 idle days** and must be un-paused by hand |
| API | **Render** free web service | 750 instance-hours/month, one instance, **spins down after 15 min idle, ~1 min to wake**, no persistent disk; **without a card on file, going over suspends instead of billing** | The spec's choice; no billing account needed (Cloud Run requires linking one) |
| Web (storefront + dashboard) | ❓ see the decision below | Render static sites are free and don't spin down | |
| Model for the public chat | **Gemini 3.5 Flash-Lite, free tier, on a separate Google project/API key for the demo** | Quota is per project, so the demo can't use up the dev/eval quota. Free-tier prompts may be read by Google: fine for fictional data, but the widget must tell visitors not to type personal information | Already the team's model; $0 |

- **No card on Render, Neon or Google AI Studio.** Every limit is then a hard stop, not a bill. Render's docs say exceeding limits *bills if a payment method exists*, so don't add one.
- **Groq stays dev/eval only:** see the paid-model guard in section 3.

**❓ Decision A: one service or two.**
- **(Recommended) Two services:** a Render static site for the web app, and the Render API service.
  - The page loads instantly even when the API is asleep. The widget and dashboard show "waking the server up (up to a minute)" while the API starts.
  - The web app calls the API's URL directly. That needs CORS, using Hono's built-in middleware, so no new dependency.
  - A Render rewrite (`/api/*` → the API) would avoid CORS, but whether it passes the chat's streaming progress through isn't documented, so I'd use direct calls.
- **One service:** the API also serves the built web app. It's simpler (same origin, no CORS), but after 15 idle minutes the *whole page* takes about a minute to appear: a poor first impression for a recruiter.

## 2. Admin login (replaces the shared token)
- **❓ Decision B (recommended): a password login, using no new dependencies.**
  - `ADMIN_PASSWORD_HASH` (scrypt, from `node:crypto`) and `SESSION_SECRET` are set as Render environment variables.
  - `POST /api/admin/login` returns a signed session token (HMAC, 12 h expiry). The dashboard keeps it for the tab and sends it as `Authorization: Bearer …`, exactly where the admin token goes today. No cookies, so the two-service setup has no cross-site cookie problems.
  - Login attempts are rate-limited (e.g. 5 per 15 min per IP). Everything under `/api/admin/*` stays behind one guard, as now.
  - Alternative: keep the long shared token. It's already safe enough for one admin, but the spec says "admin login".
- **Admin-only on the public site:** live traces (already admin-only), and, recommended, the Approvals page's model-written notes ("agent note", "queued because"), which can echo what a visitor typed (M4 open item).

## 3. Public demo limits (spec: "small daily cap and per-visitor rate limit; when the cap is reached, replay saved example conversations")
- **Per visitor (in memory; one instance):** at most 3 new chats per hour and 20 messages per chat per IP, with the existing 1,000-character message limit. The IP comes from Render's forwarded header.
- **❓ Decision C: daily cap.** A global cap of **N live chats per day**, counted in a small `demo_usage` table so restarts don't reset it.
  - I suggest **N = 40**. That's about 160 Gemini calls/day at the 4.4 calls per conversation measured in test-1, well inside the free quota, and leaves room if a cap is mis-set.
- **When the cap is hit:** the widget switches to **replay mode**. It plays saved example conversations, clearly labelled "replay of a saved conversation (the live demo's daily limit is reached)", with a link to the full trace.
  - The examples are curated like the overview's safety examples (`server/config/demo-replays.json`), from passed `test-1` conversations. The server re-checks that each one passed.
- **Paid-model guard:** in demo mode (`DEMO_MODE=1`), the server refuses to run the public chat on a model whose config is `paid` unless `DEMO_ALLOW_PAID=1` is set.
  - So switching the team to gpt-oss-120b on the public site can't silently spend Groq money.
  - Cost if Julian later allows it: about $0.0013 per gpt-oss-120b conversation (test-1: $0.14 / 110), so 40/day ≈ $1.60/month, inside the $8 cap.
- **Demo data:**
  - Seed once into Neon (`npm run db:migrate && npm run db:seed` with Neon's URL, from the laptop).
  - Add the decided **demo-only example approvals** (pending and decided, on customers and orders no eval case uses), so the queue isn't empty. These stay out of the eval seed (`db:seed --demo`).
  - **❓ Decision D:** whether visitors' refunds and coupons are reset. Options:
    - (recommended) an admin "Reset demo store" button: reseeds store tables, keeps the team history
    - reseed on every deploy
    - never reset

## 4. Changes needed before it can run on a free host
- `serve.ts` listens on `127.0.0.1`. It needs `HOST=0.0.0.0` in production.
- **Run migrations at server start** (`runMigrations` exists), so a deploy can't run old code against a new schema. Render's pre-deploy step isn't on the free plan.
- **Cache graded eval runs in memory.** The files never change while the server runs, so the overview and Runs pages stop re-grading all 330 test-1 conversations on every request. Render's free instance has 0.1 CPU.
- `VITE_API_URL` for the static site (two-service option), plus CORS limited to that origin.
- A `render.yaml` blueprint in the repo with **no secrets**. Secrets go in Render's dashboard:
  - `DATABASE_URL`
  - `GEMINI_API_KEY` (the demo key)
  - `ADMIN_PASSWORD_HASH`
  - `SESSION_SECRET`
- **Auto-deploy from `main`** after CI passes (Render's "after CI checks pass" option).

## 5. Order of work
1. **Julian:** the switch/retire decision (spec: first in M5). It's made locally on the Agents page, and the team history is copied into Neon by the seed (`team_changes` is kept).
2. Production basics (section 4), with tests.
3. Admin login (section 2), with tests: wrong password, expired or forged token, rate limit, every admin route still guarded.
4. Demo limits and replay mode (section 3), with tests: cap reached → replay, per-IP limits, the paid-model guard.
5. Demo-only example approvals and the reset (section 3).
6. Deploy. **Julian creates the accounts** (Neon, Render, a demo Google AI Studio key), with **no card**. I write `render.yaml` and the step-by-step instructions, and walk through each setting.
7. Check the live site: storefront chat, the cap and replay (with a temporary cap of 1), admin login, phone width.

**Cost: $0.** No card is on any platform, every free limit suspends instead of billing, and the public chat uses a free model with a hard daily cap. CI stays within GitHub's free 2,000 minutes.

**Not in this plan:** serving the small open model on Modal for the demo (the 4th model isn't chosen yet; M3 open item).

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
