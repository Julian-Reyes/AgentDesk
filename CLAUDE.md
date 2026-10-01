# Switchyard Lite — working rules
Full spec: docs/PROJECT.md. Progress: PROGRESS.md.

## How to work with me
- Explain non-obvious decisions in plain language as you go. I want to understand the code, not just have it.
- Run the tests before saying something works. Never weaken tests to make them pass.
- After each milestone: update PROGRESS.md and commit.
- Within a milestone, commit at sensible checkpoints (a coherent chunk with tests and typecheck passing), with a message saying the milestone is in progress.
- Keep secrets out of the repo; maintain .env.example.
- Ask before adding dependencies beyond those listed in docs/PROJECT.md, and before any spending (give a cost estimate first).
- Finish one milestone fully (tests passing, PROGRESS.md updated) before starting the next.

## Non-negotiables
- Business rules live in code, never only in prompts: price math only via quote_price; refunds auto ≤ $50, else approvals queue, never above amount paid; goodwill only for store-caused problems (lost, damaged, late), ≤ 10% and ≤ 1 per customer per month, else approval; customers see only their own orders; invalid/expired coupons never honored; no price matching.
- $0 by default. Modal is allowed within its free monthly credit: usage budget capped at $30 and spend limit at $0, so there are no out-of-pocket charges. If Modal won't accept a $0 spend limit, stop and ask me. Groq paid tier allowed, capped at $8/month by a hard spend limit. Any spending beyond free tiers or free credits requires my approval with a cost estimate first. Tests use the fake provider and never call real APIs. The default dev model is Gemini 3.5 Flash Lite (`gemini/gemini-3.5-flash-lite`) until the local model is set up; then Ollama.
- No agent frameworks (no LangChain, no agents SDK). The agent loop is hand-written.
- Model IDs live in config, never hardcoded. Send only fictional data; never send secrets.
- Honesty: every number in README/case study/dashboard comes from a real eval run. Show weaknesses.
- Never cut: evals, grounding check, tracing, deployment.

## Conventions
- Money is integer cents everywhere. Percentages are integers.
- Tools return `{ ok: true, data } | { ok: false, error: { code, message } }`. They don't throw for business outcomes.
- "Now" comes from an injected clock, never `new Date()` inside domain code.
