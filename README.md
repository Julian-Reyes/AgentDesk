# Switchyard Lite

A customer-support and shopping assistant for **Larchgrove Supply Co.**, a fictional outdoor-gear store. A router hands each conversation to one of two agents (shopping, or orders & returns). Business rules are enforced in code, not in prompts. Everything is traced and evaluated across several models.

Every product, customer and order here is fictional. The full spec is in [`docs/PROJECT.md`](docs/PROJECT.md), and progress is in [`PROGRESS.md`](PROGRESS.md). The architecture diagram and results table come with the final milestone. Every number in them will come from a real eval run.

## Run it locally

You need Node 24+ and Postgres (Postgres.app works; it connects as your Mac user).

```sh
npm install
cp .env.example .env            # then fill in GEMINI_API_KEY (free tier) and, for dashboard actions, ADMIN_TOKEN
createdb switchyard_dev && createdb switchyard_test
npm run db:migrate
npm run db:seed                 # the fictional store: 60 products, 200 customers, 400 orders
git config core.hooksPath .githooks   # pre-commit: typecheck + tests
```

### The storefront and the ops dashboard

```sh
npm run dev
```

This starts the API and the web app together, and Ctrl-C stops both.

- **Storefront with the chat widget:** http://localhost:5180. Pick a demo customer, then chat. The assistants only see the chosen customer's orders.
- **Ops dashboard:** http://localhost:5180/ops/
  - **Approvals:** refunds over $50 and goodwill over the limits wait here for a human.
  - **Agents:** each role's model, its history and its live numbers. Switch, retire or reinstate a model, with a reason.
  - **Model comparison:** eval results per model, with 95% intervals.
  - **Runs:** live and eval traces, step by step.

  Reading is public. Approving, changing the team and viewing **live** conversations need the admin token from `.env` (`ADMIN_TOKEN`, at least 24 characters, e.g. `openssl rand -hex 24`). Eval traces are public: they're fixed, fictional scripts.

Ports come from `.env`: `WEB_PORT` (default 5180) and `API_PORT` (default 8787). The web server stops with an error if its port is taken, instead of moving to another one.

The chat uses the team set on the Agents page; the starting team is `server/config/team.json` (Gemini 3.5 Flash-Lite, free tier). `MODEL` in `.env` overrides every role.

### Other commands

| Command | What it does |
| --- | --- |
| `npm test`, `npm run typecheck` | Tests (fake model provider only, never a real API) and types, for the server and the web app |
| `npm run chat -- --as maya.chen@example.com` | Chat in the terminal as a seeded customer |
| `npm run tool -- list` | Call a single tool by hand |
| `npm run trace -- <run id>` | Print a traced conversation |
| `npm run eval:run`, `eval:judge`, `eval:report`, `eval:compare` | The eval pipeline (see PROGRESS.md, Milestone 3) |
| `npm run eval:sets` | Precompute the Model comparison page from `server/config/comparison.json` |
| `npm run eval:draft-from-rejections` | Turn rejected approvals into draft eval cases for review |
