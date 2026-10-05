# Milestone 5 plan: the public site

**Status: built 2026-10-05 (sections 2–5), not deployed yet.** Julian's decisions, 2026-10-05:
- (a) the repo will be made public
- the snapshot has **all** eval runs, one JSON file per conversation, deterministic
- pilot-1 is labelled as judged by the older Gemma/rubric@1 setup
- Approvals is shown read-only, with the 5 demo-only example approvals, marked as examples

**The first deploy waits for Julian's approval of the example approval texts.** Section 6 is still plan only.

**The change (Julian, 2026-10-05): no hosted server.**
- The public site is a **static, read-only snapshot** of the dashboard and storefront on **GitHub Pages**, with no API and no database.
- All real work (chats, evals, approvals, switch/retire) stays on Julian's machine. Admin features exist only locally, and the shared `ADMIN_TOKEN` stays for local use. No login is needed on the public site.
- Live chat on the public site is a separate, later option (section 6, plan only).

This replaces the Render/Neon hosting plan proposed earlier the same day.

## 1. Before anything: GitHub Pages and the private repo ❓
GitHub Pages is available "in public repositories with GitHub Free … and in public and private repositories with GitHub Pro, Team, Enterprise" ([GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). `Julian-Reyes/AgentDesk` is private on the Free plan, so it can't publish Pages as it is. Options:
- **(a) Make `AgentDesk` public, recommended.** It's a portfolio project, and recruiters will want the code too. The full history has no secrets: checked on 2026-10-05 for API-key patterns, and `.env` was never committed. Everything is fictional.
- **(b) Keep the code private, and publish only the built site to a separate public repo** (e.g. `Julian-Reyes/agentdesk-demo`, served at `julian-reyes.github.io/agentdesk-demo`). The workflow pushes there with a deploy key stored as a repo secret: more setup, and one secret to manage.
- **(c) GitHub Pro** (about $4/month; Pages from private repos). Spending, so only with Julian's approval.

**Limits:** a published site may be up to 1 GB, with a soft 100 GB/month bandwidth limit. The snapshot is well under that (all saved eval runs are 44 MB on disk).

## 2. Export script: `npm run export:static`
- **Runs on Julian's machine against the local dev DB.** It calls the **real API in-process** (`createApp(...).app.request(...)`, as the API tests do: no port, no network). So the snapshot is exactly what the API returns, with no second code path to drift.
- **Writes `site-data/`, committed to git**, so the Pages workflow can build without a database:
  - `api/overview.json`, `api/comparison.json`, `api/comparison/<set>.json`
  - `api/agents.json`: the team, its history, and the switch/retire decision, as of export. Live metrics come from local chats.
  - `api/eval-runs.json`, `api/eval-runs/<run>/conversations.json`, `api/eval-runs/<run>/conversation/<model>/<case>.json`
  - `api/products.json`, `api/chat/personas.json` (storefront)
  - `replays.json` (section 4)
  - `meta.json`: `{ exportedAt, commit }`
- **Which eval runs:** ❓ recommended: the runs in the comparison sets (`test-1`, `dev-3-r1a/b`, `dev-3-r2a/b`), the ones every dashboard number cites, about 25 MB. Alternative: all saved runs (44 MB).
- **Refuses to run with uncommitted changes**, so the commit in the footer really produced the data.
- **Left out:** live traces (admin-only), and the admin token check. ❓ The Approvals page: recommended **left out of the snapshot**. Its items come from Julian's own local chats, and their notes are model-written (the M4 open item). Alternative: include it with the notes removed.

## 3. Static build mode (`VITE_STATIC=1`)
- **One switch in `web/src/lib/api.ts`:** in static mode, `request(path)` reads `data/<path>.json` from the site instead of calling `/api/...`. Query strings map to path segments (e.g. `conversation?model=…&case=…` → `conversation/<model>/<case>.json`). Any POST is refused with "This is a read-only snapshot". Pages and components stay the same code.
- **Hidden in static mode:**
  - the admin token box
  - Approvals actions
  - the Agents page's switch/retire/reinstate controls
  - the live Runs tab
  - (if left out of the snapshot) Approvals in the nav
- **Footer on every page:** "Data as of 2026-10-05, commit `abc1234`. A read-only snapshot; the agents run on the author's machine." The commit links to GitHub if the repo is public.
- **Base path:** Vite `base` set to the Pages path (e.g. `/AgentDesk/`). Absolute links (`/ops/`, `/`, the storefront ↔ dashboard links) become base-relative. Hash routing already works on Pages.

## 4. Storefront chat: replays of saved eval conversations
- In static mode, the chat widget offers **recordings** instead of a live chat. A short list (e.g. "Order lost in the mail", "Damaged headlamp refund", "Expired coupon", "Asks about another customer's order") plays one saved eval conversation turn by turn, with the same progress labels ("Looking up your order…").
- **Clearly labelled:** "Recording of a saved test conversation (`test-1`, gemini-3.5-flash-lite). Not live; nothing you type is sent anywhere." There's no free-text input in static mode, so nothing a visitor types goes anywhere. Each recording links to its full trace in the dashboard.
- **The list is curated** in `server/config/replays.json`, like the overview's safety examples. The export includes a recording only if its conversation **passed**, re-checked with the same `evalResults` helper, and a test fails if one drops out.

## 5. GitHub Actions: deploy to Pages
- **New `.github/workflows/pages.yml`, on push to `main`:**
  1. `npm ci`
  2. `VITE_STATIC=1 npm run build -w web`
  3. copy `site-data/` into the build as `data/`
  4. `actions/upload-pages-artifact` and `actions/deploy-pages` (permissions `pages: write`, `id-token: write`)
- **CI first:** the deploy job needs the existing CI job to pass first, so a red build never deploys.
- **Julian's one-time setup:** repo Settings → Pages → Source: **GitHub Actions**. With option (b), it's set on the public repo instead, plus the deploy key.
- **Cost:** $0. Building the site takes a minute or two of Actions time, within the free 2,000 minutes/month.

**Tests:**
- **Export:** each file equals the matching API response; it refuses a dirty tree; it drops a failing replay.
- **The static `request` mapping:** paths, query strings, POST refused.
- **Static mode hides admin and live UI:** a pure function decides what's shown, tested like the other dashboard logic.
- **The CI build:** CI runs a static build so it can't silently break.

**Order:**
1. Julian picks option (a), (b) or (c).
2. Export script.
3. Static mode and footer.
4. Replays.
5. Pages workflow.
6. Julian enables Pages, and we check the live site at desktop and phone width.
7. Then the switch/retire decision (Julian, locally), re-export, and push.

## 6. Later, plan only: optional live chat through Cloudflare Tunnel
- **What:** when Julian's machine is on, the static storefront offers **live chat** through a Cloudflare Tunnel to a local server. When the tunnel is unreachable, it falls back to the recordings automatically.
- **A separate demo server process (`DEMO_MODE=1`):**
  - it mounts **only the public chat routes**: no `/api/admin/*`, no traces, no approvals
  - it uses its **own database, `agentdesk_demo`**, never `agentdesk_dev` or the test DB, so visitors can't touch dev or eval data
  - its team is **Flash-Lite only**: paid models are refused
  - limits: **40 live chats/day** (counted in `agentdesk_demo`), 3 new chats/hour and 20 messages/chat per visitor, 1,000-character messages
  - a separate Gemini demo key, so the demo can't use the eval quota
- **Reset:** an admin-only "Reset demo store" action (from the local dashboard) reseeds `agentdesk_demo`'s store tables and keeps its team history, plus an automatic nightly reset (a local scheduled job).
- **Fallback:** the static site checks `GET <tunnel>/api/health` with a short timeout before offering live chat. It also switches to recordings when the daily cap is reached.
- **Open issue to settle then:** a free "quick tunnel" gets a **new random URL each start**, so the static site would need a re-deploy, or a small published pointer file, each time. A fixed URL needs a domain on Cloudflare (~$10/year, spending, so approval first). I'll check Cloudflare's current terms when we get there.
- The widget tells visitors not to type personal information. Gemini's free tier may use prompts to improve Google's products (`docs/FREE_TIERS.md`).

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
