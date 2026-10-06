# Milestone 7 plan (optional): live chat, new models, Portuguese

Not started. Moved here from `docs/M5_PLAN.md` §6 on 2026-10-06, where live chat had been parked since 2026-10-05 (Julian), and extended with the items below. Nothing here is decided until M7 starts; spending needs a cost estimate and Julian's approval first.

## 1. Live chat on the public site

Julian already uses Render, Cloudflare and Fly.io, so M7 may use one of those instead of, or alongside, a Cloudflare Tunnel. Choose when M7 starts, after checking each one's current free terms.

### The original sketch (2026-10-05): live chat through Cloudflare Tunnel
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
- **To revisit (2026-10-06):** the sketch assumes Gemini's free tier ("Flash-Lite only: paid models are refused", "Gemini's free tier may use prompts …"). The Gemini project is on the paid tier since 2026-10-06, capped at $5/month, so the demo's model, key and limits need re-deciding against that cap.

## 2. Models parked for M7 (Julian, 2026-10-06)
Kimi and DeepSeek are parked until M7. **No accounts, keys or calls before then.**
- **Kimi K2.5 via OpenRouter, with a pinned provider** (OpenRouter's provider routing set to one upstream, so latency and behaviour don't change between calls). Not configured yet. Moonshot's own API no longer offers K2.5. Check OpenRouter's current price and the pinned provider's on their own pages when M7 starts.
- **DeepSeek Flash** on DeepSeek's own API: already in `models.json` as `deepseek/deepseek-flash` (priced at peak, so recorded cost is an upper bound), unused. Details in `docs/FREE_TIERS.md`.
- **Both are prepaid.** Their spending caps are agreed with Julian when M7 starts, before the first call, and added to CLAUDE.md's non-negotiables next to Groq's and Gemini's.

## 3. Portuguese (Brazil) for the site (Julian, 2026-10-06)
A language switch at the top right, **"EN | PT"** with the US and Brazilian flags next to the labels (flags stand for countries, not languages, so they don't appear alone).
- **Translated:** the interface (navigation, headings, table labels, footnotes, the storefront) and the curated texts in `server/config/overview.json` and `server/config/replays.json` (a Portuguese version beside each English one). Numbers and dates follow pt-BR conventions through `Intl` (`78,0%`, `06/10/2026`); prices stay in US dollars.
- **Not translated:** the recorded eval conversations and traces, the README and the case study. They're real recorded data, so the page says they were recorded in English.
- **How:** typed translation files in the web app (`en`, `pt-BR`), with no new dependency; TypeScript makes a missing Portuguese string a build error. The language is in the URL (e.g. `?lang=pt`), so a Portuguese link can be shared; it's remembered in the browser and set on `<html lang>` for screen readers.
- **Quality:** Claude drafts the Brazilian Portuguese; a native speaker reviews it before it's published.
- **Out of scope:** agents replying in Portuguese in live chat (prompts, grading and evals in Portuguese) is separate, larger work.

## 4. Round-4 option: the damage cause from the customer's words (not decided)
The damage-cause rule still trusts the cause the model reports (gpt-oss: 1 of 12 dev tries refunded a headlamp that failed after use). Option: an automatic damaged refund only when the customer's own messages describe damage on arrival; otherwise it goes to approval (never refused outright). Needs Julian's policy decision, dev and test cases for wording edge cases, and repeat dev runs (≈ $0.20 each) before it counts as measured.
