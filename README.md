# AgentDesk

**A team of AI agents that runs a store's customer chat, built, measured, and managed like a real system.**

AgentDesk answers customers of **Larchgrove Supply Co.**, a fictional outdoor-gear store:
- **A router** sends each conversation to a **shopping agent** (products, stock, prices, coupons) or an **orders & returns agent** (tracking, refunds, damaged items), and the two hand off to each other.
- **Business rules are enforced in code, never only in the prompt.** Prices come only from a pricing tool; refunds over $50 wait for a human; customers see only their own orders.
- **Every conversation is traced.** The same agents are evaluated on a held-out test set across three models, and an ops dashboard shows the results, the approvals queue and the team.

The agent loop is hand-written TypeScript (no agent framework). Every product, customer and order is fictional.

## Architecture

```mermaid
flowchart LR
    C([Customer]) --> W[Storefront chat widget<br/>React + Vite]
    W -->|/api/chat| API[API server<br/>Hono, Node 24]
    API --> R{Router agent}
    R --> S[Shopping agent]
    R --> O[Orders & returns agent]
    S <-->|handoff| O
    S --> T[15 tools]
    O --> T
    T --> P[Policy layer<br/>pricing, refunds, goodwill,<br/>returns: rules.ts]
    P --> DB[(Postgres<br/>Drizzle)]
    T -->|over the limits| Q[Approvals queue]
    API --> TR[Tracer: every step]
    TR --> DB

    subgraph Evals
      CASES[153 cases<br/>43 dev + 110 test] --> RUN[Eval runner<br/>each conversation rolled back]
      RUN --> G[Code graders +<br/>grounding check]
      RUN --> J[LLM judge<br/>gpt-oss-20b]
      G --> REP[Reports + comparison sets]
      J --> REP
    end

    REP --> D[Ops dashboard<br/>overview, approvals, agents,<br/>model comparison, traces]
    Q --> D
    DB --> D
```

- **Models are configuration** (`server/config/models.json`, `team.json`): Gemini 3.5 Flash-Lite (free tier), and gpt-oss-120b and Qwen3.8-27B on Groq. All go through one OpenAI-compatible client, and tests use a scripted fake provider, never a real API.
- **"Now" is an injected clock**, money is integer cents, and tools return `{ ok, data } | { ok: false, error }` instead of throwing.
- **Business limits live in one file** (`server/src/policy/rules.ts`). The policy text the agents read is generated from the same constants, so it can't promise something the code won't do.

## Results: held-out test set (`test-1`)

110 test cases, never used for tuning, × 3 models = 330 conversations. Run 2026-10-05, judged by gpt-oss-20b (`rubric@4`). Rates show 95% Wilson intervals. Every number comes from [`server/eval-results/runs/test-1/report.md`](server/eval-results/runs/test-1/report.md).

| | Gemini 3.5 Flash-Lite | gpt-oss-120b | Qwen3.8-27B |
| --- | --- | --- | --- |
| **Task success** | **72%** (78/109, 62–79%) | **72%** (79/110, 63–79%) | **65%** (71/109, 56–73%) |
| Shopping / support cases | 78% / 65% | 83% / 63% | 59% / 67% |
| Routing accuracy | 96% (91–99%) | 99% (95–100%) | 94% (87–97%) |
| **Policy violations** (target 0) | 1 | 2 | 1 |
| Conversations with an invented fact | 2% (1–6%) | 2% (1–6%) | 4% (1–9%) |
| Reply time per turn, p50 / p95 | 4.4 s / 24.4 s | 3.5 s / 8.4 s | 2.6 s / 5.1 s |
| Cost for 110 conversations | $0.00 (free tier) | $0.14 | $0.96 |

**There's no winner.** The comparison never recommends a model that broke a business rule, and all three did at least once. Flash-Lite and gpt-oss-120b are statistically tied.

**The judge was checked against a human:** on 30 blindly graded replies (dev set, an earlier rubric version), its yes/no answers agreed with the human grader 95% of the time (77/81, 88–98%).

### Known weaknesses (shown, not hidden)
- **Held-out scores are lower than dev** for every model: Flash-Lite 85% → 72%, gpt-oss-120b 76% → 72%, Qwen 68% → 65%. The dev numbers are optimistic because prompts were tuned on them.
- **The policy violations were real:**
  - Two models refunded a headlamp the customer said they *dropped*, and one that stopped working *after a trip*, as "damaged". The $50 limit held, but the code trusted the model's reason. **Fixed in code since** (a damaged refund must state when the damage happened; only damage on arrival is refunded), **not re-measured yet.**
  - Qwen issued a smaller coupon than requested instead of sending the request for approval.
- **gpt-oss-120b sometimes promises follow-ups it can't do** ("I'll check back"), in 5 of 110 conversations.
- **One Flash-Lite reply showed raw tool syntax** to the customer. The graders first missed it. Both checks now catch it, and it's counted above.
- **The judge (gpt-oss-20b) is from the same family as one of the agents** (gpt-oss-120b). Its agreement is reported per agent model rather than assumed fair.

## Run it locally

You need **Node 24+** and **Postgres** (Postgres.app works; it connects as your Mac user).

```sh
npm install
cp .env.example .env            # fill in GEMINI_API_KEY (free tier); ADMIN_TOKEN for dashboard actions
createdb agentdesk_dev && createdb agentdesk_test
npm run db:migrate
npm run db:seed                 # the fictional store: 60 products, 200 customers, 400 orders
git config core.hooksPath .githooks   # pre-commit: typecheck + tests
npm run dev                     # API + web; Ctrl-C stops both
```

- **Storefront with the chat widget:** http://localhost:5180. Pick a demo customer, then chat. The agents only see that customer's orders.
- **Ops dashboard:** http://localhost:5180/ops/
  - **Overview:** results, the team, the switch/retire decision, safety examples linked to real traces.
  - **Approvals:** the human queue.
  - **Agents:** switch, retire or reinstate a model per role, with a reason and history.
  - **Model comparison** and **Runs:** traces, step by step.
- **Admin token:** reading is public. Approving, changing the team and viewing live conversations need `ADMIN_TOKEN` (24+ characters, e.g. `openssl rand -hex 24`).

| Command | What it does |
| --- | --- |
| `npm test`, `npm run typecheck` | All tests (fake model provider only) and types, server and web |
| `npm run chat -- --as maya.chen@example.com` | Chat in the terminal as a seeded customer |
| `npm run tool -- list` | Call a single tool by hand |
| `npm run trace -- <run id>` | Print a traced conversation |
| `npm run eval:run -- --name <run> --split dev --estimate-only` | Eval pipeline; always shows a cost estimate first |
| `npm run eval:report -- --name <run>`, `npm run eval:sets` | Re-grade a saved run (no model calls); rebuild the comparison |

## Documentation
- [`docs/PROJECT.md`](docs/PROJECT.md): the spec, and every change made to it.
- [`PROGRESS.md`](PROGRESS.md): current status, next steps and open items.
- [`docs/history/`](docs/history/): the detailed record per milestone, with every decision, number and fix ([M1](docs/history/M1.md) · [M2](docs/history/M2.md) · [M3](docs/history/M3.md) · [M4](docs/history/M4.md) · [M5](docs/history/M5.md)).
- [`docs/JUDGE_RUBRIC.md`](docs/JUDGE_RUBRIC.md): how the LLM judge scores and why.
- [`docs/FREE_TIERS.md`](docs/FREE_TIERS.md): the models' limits, and how the project stays at $0–8/month.
- The eval cases: `server/src/evals/cases/` (dev) and `server/src/evals/cases/test/` (held out).
