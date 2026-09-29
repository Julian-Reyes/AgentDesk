# Milestone 3 plan: Evals

Agreed with Julian on 2026-09-29. Work starts in the next session.

## Context
Milestone 2 is closed (last commit `0297605`, 215 tests passing). Julian will continue with Milestone 3 tomorrow. Per `docs/PROJECT.md`, M3 = the ~150 test conversations (Julian reviews every one), the graders, the grounding checker, the rate-limit-aware runner with preflight estimates, and the first comparison run. This plan sets the order for the first session, so we start from the parts that don't need the Mac mini or any quota.

## Before starting (read, don't change)
- `PROGRESS.md`: open items (the local model choice blocks the **first full comparison run**, not the start of M3), "Eval cases collected from manual testing", and the M3 notes (tool-call health per model, router-model question, ShopRoute, Groq throughput).
- `docs/PROJECT.md`: the Evaluation section (case types, metrics, 40 dev / 110 test split, judge validation on 30 replies).

## Order of work
1. **Design the eval case format first** (small, reviewed by Julian before any cases are written). A typed, Zod-validated file per case: id, split (dev/test), type (from the spec's table), signed-in customer, the conversation turns, and the **expected outcome in checkable terms** (expected route; tools that must or must not be called; amounts via `quote_price`/policy; the outcome `resolved`/`approval_needed`/`escalated`; facts that must appear). Anchored to the seeded data (`server/src/seed/data.ts`).
2. **Draft the ~40 dev conversations first**, covering every case type (product facts, comparison, recommendation, price and deals, invalid coupon, stock, order status, returns, refund within/over limit, adversarial, out of scope), including the cases already collected in PROGRESS.md. **Julian reviews all 40 before any test-set case is written.** Then draft the ~110 test conversations in batches by type, each batch reviewed by Julian.
3. **Graders and the grounding checker**, test-first, using the fake provider only: deterministic graders per case type; the grounding check that compares product names, prices and specs in replies against the catalog; `toolCallHealth()` (`server/src/tracing/tool-call-health.ts`) aggregated per model.
4. **The LLM judge for reply quality**, after the graders:
   - A written rubric for tone, clarity and helpfulness (scale and examples per score), reviewed by Julian, versioned like the prompts.
   - A small grading tool for Julian to score 30 replies himself with the same rubric, blind to the judge's scores.
   - Report how often the judge agrees with Julian (the agreement rate), alongside the results.
5. **The runner:** per-conversation store reset (rolled-back transaction; `DbTracer` already survives it), checkpoint/resume, the shared rate limiter and replay cache already in `server/src/llm/`, progress/ETA, and a **preflight estimate** (calls, time, $) using the measured tokens per call in `docs/FREE_TIERS.md`.
6. **Tune on the ~40 dev conversations only**, and run the ~110 test conversations once prompts are settled (Groq gpt-oss-120b's 8K tokens/min makes full runs take many hours).
7. The first full comparison run waits for the local model choice (Mac mini).

## Constraints to keep in mind
- No real API calls in tests; $0 budget; ask before new dependencies.
- Every number reported comes from a real eval run; show weaknesses.
- Checkpoint commits at sensible points; update PROGRESS.md.

## Verification
- `npm run typecheck && npm test` stay green after each step.
- Julian has reviewed and approved the case format and every case batch before the graders are finalized.
