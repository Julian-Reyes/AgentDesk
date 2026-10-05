# Milestone 4 plan: UI (storefront chat widget + ops dashboard)

Agreed with Julian on 2026-10-02. Work started the same day, after the 110 test cases were committed.

## Context
M4 per `docs/PROJECT.md`: a **storefront chat widget** (customer view) and an **ops dashboard** (Agents, Model comparison, Runs, Approvals). The data already exists and should be reused, not rebuilt:
- **Live conversations:** `runs` / `run_steps` in Postgres (`server/src/tracing/tracer.ts`, `DbTracer`), driven by `Conversation.start()` / `send()` (`server/src/agents/conversation.ts`), exactly as `src/scripts/chat.ts` does it.
- **Eval results:** files under `server/eval-results/runs/<run>/` (`RunStore`, `src/evals/runner/store.ts`): manifest, one `ConversationRecord` per conversation (case snapshot, `Observation` with the full trace steps, grade, stats), judge verdicts. Metrics come from `buildResults` / `modelReport` (`runner/report.ts`), `summarizeRun` / `poolSummaries` / `repeatGap` (`runner/compare.ts`), `regrade` / `judgeFor` (`runner/stages.ts`), `toolCallHealth` (`tracing/tool-call-health.ts`).
- **Approvals:** the `approvals` table, filled by `issue_refund` (+ a `pending_approval` refund row) and `issue_goodwill_coupon` (`src/tools/support.ts`). Nothing approves or rejects them yet (PROGRESS: "belongs to M4").
- **Team:** `config/team.json` + `loadTeamSpec` / `buildTeam` (`src/agents/team.ts`); its comment already says M4 moves it into the DB with a switch/retire history.

There's no HTTP server and no frontend yet. Out of scope (M5): hosting, the public daily cap / per-visitor limit / replay fallback, and real admin login. M4 leaves clean seams for each.

## Gate (Julian's decision, 2026-10-02): start right after the test cases
M4 starts once the other session's 110 test cases are written and committed, **while M3's test run, judge calibration and the 4th (small open) model are still open**. This is an exception to CLAUDE.md's "finish one milestone first", so the first M4 commit records it in PROGRESS.md (M3 stays "in progress" with its remaining items listed).

What the overlap means in practice:
- **The M3 test run (`test-1`) runs from a git worktree pinned at `8540db4`** (branch `test-run-1`, planned for 2026-10-03), so M4 work on `main` can't change what's tested.
- **It shares the dev database.** During the test-run window (Julian says when it starts and ends): no migrations, no `db:seed` and no dev chats against the dev DB. Steps that need a migration (4 and 5) wait for the window to end if they reach that point during it.
- **The test DB is shared too:** the worktree's pre-commit hook runs the old tests against `agentdesk_test`. M4's migrations only add a nullable column and a new table, which the old code ignores.
- **Groq budget is shared:** the test run (~$1.90) has priority; M4 dev chats use Flash-Lite (free).
- **Flash-Lite's ~500 requests/day** is shared too: no Flash-Lite dev chatting on the day of the test run.
- The comparison page (step 6) starts with the dev sets; the test-run set is added to `comparison.json` when the run exists.

## Dependencies (approved with the plan, 2026-10-02)
Listed in the spec: Hono, React, TypeScript, Vite, Tailwind, Vitest. Needed alongside them, not named in the spec:
- `@hono/node-server` (Hono's Node adapter; Hono itself has no Node listener)
- `react-dom`, `@vitejs/plugin-react`, `@tailwindcss/vite` (Tailwind v4's Vite plugin), `@types/react`, `@types/react-dom`
- No router, state, chart or query libraries: hash routing and `fetch` by hand, comparison bars in plain CSS. Fewer deps, and it keeps the code readable.

## Layout
- New npm workspace **`web/`** (Vite + React + Tailwind). Two entry pages: `/` storefront + widget, `/ops/` dashboard (one Vite app, two HTML entries, so they share components and the API client).
- **`server/src/api/`**: Hono app (`app.ts` builds it from injected deps, so tests call `app.request()` with no listener and no supertest), `server/src/scripts/serve.ts` (`npm run serve`, port from env). Vite dev proxies `/api` to it.
- Root scripts: `npm run dev` (server + Vite), `npm run build -w web`.

## Work order (each step: tests + typecheck green, checkpoint commit "Milestone 4 in progress: …")

### 1. API skeleton + read-only data
- `createApp(deps)`: `db`, `clock` (store clock for domain), `now` (wall clock for decision timestamps), `resultsDir`, a team loader, a provider-options hook (tests inject `FakeProvider`). Errors as `{ ok:false, error:{code,message} }`, same shape as tools.
- `GET /api/products` (storefront grid), reusing `presentProduct` / `currentPriceCents` (`src/tools/common.ts`) so prices match the agents' tools exactly.
- **Admin seam:** `requireAdmin` middleware on every mutation. M4: a bearer token from `ADMIN_TOKEN` in `.env` (unset = mutations disabled); M5 swaps in a real login. GETs stay public (the dashboard is public, read-only).
- `.env.example`: `PORT`, `ADMIN_TOKEN`.

### 2. Chat API (customer view backend)
- `POST /api/chat` `{ persona }` → starts a `Conversation` (source `"demo"`, labels `{ persona }`), returns `{ conversationId, token, greeting }`. Identity comes from a **demo persona picker** (the eval anchors Maya, Daniel, Priya, Tom, Sofia, or anonymous), set by the app, never by the model, same as `session.customerId` in the CLI.
- `POST /api/chat/:id/messages` `{ text }` + the token. Responds as **Server-Sent Events** (Hono's built-in `streamSSE`, no dep): `progress` events while the turn runs, then one `reply` event `{ reply, answeredBy, outcome }`. Why SSE: a Flash-Lite turn can take 10–60 s, and "Checking order #1042…" beats a silent spinner. Progress comes from a small `ObservingTracer` that wraps `DbTracer` (same pattern as `RecordingTracer` in `run-case.ts`) and maps `tool_call`/`handoff` steps to customer-safe labels (a fixed table: tool name → text; never tool args or results).
- Conversations live in an in-memory map (id → `Conversation`, random token, last-used time), with a TTL (30 min) and a max count. One turn at a time per conversation (a second send gets `409 TURN_IN_PROGRESS`). Message length capped. Restarting the server ends live chats; their traces stay in the DB. (Fine for one instance; noted for M5.)
- Failed turns: the customer gets `FAILURE_REPLY`; `TurnResult.error` goes only to the trace, never to the client.
- The team comes from the DB (step 5); dev default is Flash-Lite (free).

### 3. Storefront + chat widget (`web/src/storefront/`)
- A simple Larchgrove Supply Co. page (Julian, 2026-10-02: product grid, no cart): category filter + product grid (name, current price with "was" price on sale, rating). Read-only, no cart.
- Chat widget, bottom-right: persona picker ("Demo: sign in as…", labelled as fictional), message list, typing indicator with the latest progress label and elapsed seconds, outcome badges ("Sent for approval", "Escalated to a person"), "New conversation" button, error state. Replies render as plain text (no HTML injection). Keyboard and screen-reader basics (focus, `aria-live` for new replies). Works at phone width.

### 4. Approvals queue (backend first)
- **Migration `0005`**: `approvals.run_id text` (nullable, no FK, like traces), so an approval links to the conversation that created it. `ToolContext` gets an optional `runId`; `Conversation.runTool` passes `this.trace.id`; the two tools store it. Small, tested change.
- `src/approvals/decide.ts`, pure rules + one transaction per decision, order row locked `FOR UPDATE` like `issue_refund`:
  - **Approve refund:** the linked `pending_approval` refund becomes `issued`. Re-check at approval time that it still fits what was paid (item-level for damaged, order-level for all, excluding this refund itself), reusing the refund policy functions (`src/policy/refunds.ts`). If not, refuse with `OVER_REFUNDABLE` and leave it pending. **A human can never approve above the amount paid.**
  - **Approve goodwill:** create the coupon (`GOODWILL-<approvalId>`, single use, this customer only, expiry from `RULES`). Requested percent kept as asked; the human decided.
  - **Reject:** a written note is required; the refund row becomes `rejected`; nothing is issued.
  - Every decision sets `status`, `decidedBy`, `decidedAt` (wall clock), `decisionNote`; deciding twice → `ALREADY_DECIDED`.
- `GET /api/approvals?status=`, `POST /api/approvals/:id/approve|reject` (admin).
- **"Rejections become new test cases":** `npm run eval:draft-from-rejections` reads rejected approvals with a run, rebuilds the customer's messages from `run_steps`, and writes **draft** cases (customer, scripted turns, the approval, the rejection note in `why`, expectations marked TODO) to `server/src/evals/cases/drafts/` (not in `ALL_CASES`, so nothing runs until Julian reviews and moves a case in). The dashboard shows "Draft case: written / not yet" per rejection. Why a CLI and not the dashboard: cases are code Julian reviews in the repo, and a deployed dashboard can't write repo files.
- UI page: pending list (customer, order, amount or percent, the tool's reason, link to the run's trace), approve / reject with note; decided history below.

### 5. Agents page + team in the DB
- **Migration `0006`**: `team_changes` (append-only history): `role` (router/shopping/support), `action` (`switch` | `retire` | `reinstate` | `initial`), `from_model`, `to_model`, `reason` (required, min length), `decided_by`, `at`. The current team = the latest row per role; the first read seeds `initial` rows from `config/team.json`. `MODEL` in `.env` still overrides everything for CLI dev (unchanged behaviour).
- Retire semantics (Julian, 2026-10-02): a **(role, model) combination** is retired, never a whole role, so every role always has an active model; retiring the current one requires choosing a replacement in the same action. A retired combination can't be switched to without a `reinstate` (with its own reason).
- `loadTeamSpec` gains a DB-backed variant; `chat.ts` and the chat API use it; evals keep `--models` (unchanged).
- `GET /api/agents`: per role, status, current model, prompt version (`promptId` from `prompts.ts`), history, and two clearly separated metric blocks:
  1. **Live (last 7 days, from `runs`/`run_steps`):** conversations, outcome mix, failure rate, p50/p95 turn latency, tokens, cost.
  2. **Latest eval (from the comparison data, step 6):** this model's task success on this role's cases (`ModelReport.byAgent`), labelled with the run names and split.
- `POST /api/agents/:role/switch|retire|reinstate` (admin), reason required; the form shows the comparison numbers for the target model next to it.

### 6. Model comparison page
- **Precomputed JSON, not computed per request:** `eval:report` also writes `report.json` (the same `ModelReport[]` object `renderReport` uses), and `eval:compare` writes `<name>.json` next to the `.md`. So the dashboard's numbers are identical to the committed reports by construction (a test checks the md and json come from one object). Regenerate the existing runs with `eval:report` (no model calls, $0).
- `server/config/comparison.json`: the comparison sets the page offers, e.g. `{ "label": "Dev, round-2 prompts (2 repeats)", "runs": ["dev-3-r2a","dev-3-r2b"], "split": "dev" }`. The test-run set is added after the M3 test run.
- Page: one row per model, columns task success (with CI bar), routing, shopping / support success, grounding violations, policy violations, escalation rate, judge quality (tone/clarity/helpfulness with CIs), p50/p95 latency, cost, tool-call health. Split label always visible ("dev set: used for tuning" vs "test set").
- **Winner rule in code** (pure, tested): highest pooled task success among models with 0 policy violations; if its CI overlaps the runner-up's, the highlight says "leads, not significant". The page also shows the repeat gap when a set has repeats. Missing models (e.g. the small open model before Modal) are simply absent, never placeholders with numbers.

### 7. Runs page
- `GET /api/runs?source=&outcome=&model=&limit=&before=` (DB runs, paginated) and `GET /api/runs/:id` (run + steps). **Changed at close (Julian, 2026-10-02):** live traces are admin-only, at `/api/admin/runs`; eval traces stay public.
- `GET /api/eval-runs`, `GET /api/eval-runs/:run/conversations?model=&status=`, `GET /api/eval-runs/:run/conversations/:model/:case` (record + judge verdict + final status), read via `RunStore`, so eval traces work even where the DB doesn't have them (the deployed DB in M5).
- UI: two tabs, **Live** and **Eval**. Trace view: a step timeline (customer message, router decision with confidence, model calls with tokens/latency/cached, tool calls with args, result and policy decision, handoffs, held-back replies, errors, replies), collapsed JSON for details. Eval view adds the case, each check with severity (policy / grounding / task), and the judge's answers and reasons.

### 8. Close the milestone
- PROGRESS.md section, README "how to run the UI" note, `.env.example`, commit "Milestone 4 complete".

## Tests (Vitest, fake provider only; global fetch guard stays)
- API via `app.request()`: products match `get_product` prices; chat start/send with `FakeProvider` (SSE events in order, reply, trace written, `FAILURE_REPLY` without leaking `error`, wrong token 403, concurrent send 409, TTL expiry); admin required for every mutation.
- Approvals (real test DB, rolled-back transactions like the tool tests): approve $179.99 → refund issued for exactly that; approving after another refund would exceed paid → `OVER_REFUNDABLE`; reject needs a note; double decision; goodwill approve creates one customer-bound coupon; `run_id` stored by the tools.
- Team history: initial seed from file, switch needs reason, retire needs replacement, retired combo blocked until reinstate, `MODEL` override intact.
- Comparison: winner rule (incl. a policy-violation model excluded, overlapping CIs), report.json = report.md source, comparison.json validated.
- Draft-from-rejections: produces a draft that isn't in `ALL_CASES`.
- Frontend (Julian, 2026-10-02: no component-test deps): UI logic kept in pure functions (formatters, step labels, winner display, SSE parsing, persona list) and tested with Vitest in Node; components are checked by hand (verification below).
- Sanity checks as before: break the over-paid re-check, the admin guard, and the reason requirement → tests fail.

## Not touched (the other session's area)
`server/src/evals/cases/*` (except the new `drafts/` folder), `case-schema.ts`, `validate-cases.ts`.

## Costs
$0 to build: tests use the fake provider; dev chats use Flash-Lite (free). Switching the dev team to a Groq model in the dashboard spends against the $8 cap (about $0.001–0.01 per conversation, from dev-3 costs); the Agents page shows that before confirming.

## Verification
- `npm run typecheck && npm test` green after every step.
- `npm run dev`, then by hand: as Maya, "where's #1042?" (progress label, correct status); as Daniel, the $179.99 damaged bag → "Sent for approval" → appears on the Approvals page with its trace link → approve → refund `issued` in the DB; reject another with a note → `eval:draft-from-rejections` writes a draft; switch support's model with a reason → history row, next chat uses it; Runs page shows that chat and an eval conversation; Comparison page numbers match `report.md`.
- Screenshots of each page for Julian.
