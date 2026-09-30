# Free tiers: checked 2026-09-29

Limits change often. Re-check before each real eval run, and trust the provider's own dashboard over this file.
Every number below comes from the provider's **official docs**. Third-party blog numbers are not used.

## Summary

| Provider | Status | OpenAI-compatible? | Tool calling | Free limits (per model) | Data use on free tier |
| --- | --- | --- | --- | --- | --- |
| **Gemini API** (Google AI Studio) | ✅ available | ✅ beta, `https://generativelanguage.googleapis.com/v1beta/openai/` | ✅ `tools`, `tool_choice` | `gemini-3.8-flash`: **5 RPM, 250K TPM** (2026-09-29, source: AI Studio rate-limit page); **20 requests/day** (2026-09-29, source: the API's own 429 quota error) | Used to improve Google products; **human reviewers may read inputs/outputs** (outside EEA/CH/UK). Fine for us: all data is fictional. |
| **Groq** | ✅ available | ✅ `https://api.groq.com/openai/v1` | ✅ all hosted models | `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`: **30 RPM, 1,000 RPD, 8K TPM, 200K TPD** | Not retained by default (up to 30 days for abuse monitoring). |
| **GitHub Models** | ❌ **retired 2026-07-30** | n/a | n/a | n/a | n/a |
| **Cerebras** | ❌ **no permanent free tier**: a **$5 trial** that needs a **verified payment method** and **expires 30 days** after it's granted. | not checked | not checked | Trial: `gpt-oss-120b`, `qwen-3.8-27b` at 5 RPM, 30K TPM, 1M tokens/day | Not checked. Possible **paid** provider later (needs approval + cost estimate first). |
| **OpenRouter free models** | ✅ available | ✅ | ✅ (some models) | `:free` models: 20 RPM, **50 requests/day** below 10 purchased credits (1,000/day at 10+) | Too small for eval runs. |
| **Ollama (on the Mac mini)** | ✅ runs on the M2 Mac mini on the home network | ✅ `http://<mac-mini>:11434/v1/` | ✅ `tools` (`tool_choice` is **not** supported) | Unlimited; limited by hardware. Default context window is **4096 tokens** unless `OLLAMA_CONTEXT_LENGTH` is set | Stays on the home network. |
| **Modal** (vLLM) | planned for official evals + demo; **not signed up** | ✅ via vLLM's OpenAI-compatible server | ✅ depends on vLLM's tool-call parser for the model | Starter plan: **$30/month free compute credit**. **Payment method required.** Billed per second (e.g. L4 GPU $0.000222/s ≈ $0.80/h) | not checked |
| **Ollama Cloud** | optional, not checked | ✅ `https://ollama.com/v1/` | ✅ | not checked | not checked |

**Comparison lineup (decided 2026-09-29):** Gemini **3.5 Flash Lite** (`gemini-3.5-flash-lite`: 15 RPM, 250K TPM, daily limit unknown; chosen over 3.8 Flash's 20 requests/day) · Groq `openai/gpt-oss-120b` (the "GPT" slot, replacing GitHub Models) · Groq `qwen/qwen3.8-27b` (large open model) · a small open model (developed on Ollama on the Mac mini; **official eval runs and the public demo serve it with vLLM on Modal**; Modal's pricing/free terms are not checked yet). Groq's limits are per model, so the two Groq models don't share a quota.

## Details and sources

### Gemini API
- The official rate-limits page says limits "depend on a variety of factors" and points to AI Studio instead of listing numbers.
- OpenAI compatibility is "still in beta"; parameters it doesn't support are **silently ignored**, and reasoning can't be turned off for some models.
- Pro models have no free tier. The free models are Flash / Flash-Lite (e.g. `gemini-3.8-flash`, `gemini-3.5-flash-lite`) plus older 2.5 models.
- **Account limits for `gemini-3.8-flash`, 2026-09-29 (source: AI Studio rate-limit page):** **5 RPM, 250K TPM.** RPD is not displayed there (the page only shows current usage, 0).
- **Daily limit, 2026-09-29 (source: the API's own 429 response):** `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20`. So **20 requests per day** for this model. **Failed attempts count too:** on 2026-09-29 many of the 20 went to 503 "high demand" errors and their retries, leaving only 4 successful responses.
- **All models on this account, 2026-09-29 (source: AI Studio rate-limit page, screenshots from Julian).** RPD shows only current usage, never the limit.

  | Model | RPM | TPM |
  | --- | --- | --- |
  | Gemini 3.5 Flash Lite, Gemini 3.1 Flash Lite | 15 | 250K |
  | Gemini 2.5 Flash Lite | 10 | 250K |
  | Gemini 2.5 / 3 / 3.5 / 3.6 / 3.7 / 3.8 Flash | 5 | 250K |
  | Gemma 4 26B, Gemma 4 31B (open models, served via the Gemini API) | 30 | 16K |
  | Gemini 2 Flash, 2 Flash Lite, 2.5 Pro, 3.1 Pro | 0 (no free access) | 0 |

- **Gemma 4 31B (`gemma-4-31b-it`), the LLM judge (Julian's choice, 2026-09-30).** Model id confirmed from the API's own model list. Account limits: 30 RPM, 16K TPM (the table above); daily limit unknown. **First real call (2026-09-30, one judge request, rubric@1):** valid JSON in JSON mode, but it's **preceded by a `<thought>...</thought>` block**, which the judge strips before parsing. **62.6 s latency**, 1,115 input and 248 output tokens. At that speed, ~160 judge calls for a 40-case × 4-model dev run take ~3 hours.
- **Groq `openai/gpt-oss-20b`**: the second judge, on Julian's 30 check replies only. Model id confirmed from Groq's model list. Same free limits as the other Groq models (30 RPM, 1,000 RPD, 8K TPM, 200K TPD), with its own quota. Not called yet.
- **Daily limits can't be looked up.** Successful responses carry no rate-limit headers (checked 2026-09-29 with one call each to `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite`, both HTTP 200). The only source is the 429 error once a daily quota runs out, which is how the 20/day for 3.8 Flash was found.
- **Availability:** `gemini-3.8-flash` returned frequent **503 "This model is currently experiencing high demand"** errors on 2026-09-29.
- Client handling: the rate limiter keeps every attempt (retries included) under 5/min; per-minute 429s are retried using Gemini's retry hint from the error body (it sends no `Retry-After` header); a 429 that names a daily quota fails fast.
- Sources: [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai), [terms](https://ai.google.dev/gemini-api/terms).

### Groq
- Unsupported fields: `logprobs`, `logit_bias`, `top_logprobs`, `messages[].name`, `n > 1`. `temperature: 0` becomes `1e-8`.
- Groq notes "there may be exceptions to these limits"; the account's limits page is authoritative.
- Data: "By default, Groq does not retain customer data for inference requests" (except up to 30 days for reliability/abuse monitoring). The docs don't say whether data is used for training.
- Sources: [rate limits](https://console.groq.com/docs/rate-limits), [OpenAI compatibility](https://console.groq.com/docs/openai), [tool use](https://console.groq.com/docs/tool-use), [your data](https://console.groq.com/docs/your-data).

### GitHub Models
- Closed to new customers 2026-06-16, fully retired 2026-07-30 (playground, catalog and inference API all gone).
- Sources: [retirement announcement](https://github.blog/changelog/2026-07-01-github-models-is-being-fully-retired-on-july-30-2026/), [now retired](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/).

### Cerebras
- Official docs: "The Free Trial is time- and credit-bounded: $5 in credits that expire 30 days after they're granted." Credits come only "after adding a verified payment method"; without one, API access stays inactive. After the trial, "API and Playground access stop … until you purchase credits."
- So it doesn't fit the $0 budget as a standing provider. Julian may switch to paid Cerebras later. Because the provider is part of each model config's id (`cerebras/gpt-oss-120b` vs `groq/gpt-oss-120b`), that would be a separate configuration in traces, the cache and the comparison.
- Source: [rate limits](https://inference-docs.cerebras.ai/support/rate-limits).

### OpenRouter
- Buying $10 of credits raises the daily limit; that's a paid step, so not without approval.
- Source: [limits](https://openrouter.ai/docs/api-reference/limits).

### Modal (checked 2026-09-29; not signed up)
- **Plans:** Starter "$0 + compute/month" with "$30/month free compute"; Team "$250 + compute/month" with $100 free compute.
- **Card:** "you must have a payment method on file in order to use Modal."
- **GPU prices (per second):** T4 $0.000164 · L4 $0.000222 · A10 $0.000306 · L40S $0.000542 · A100 40GB $0.000583 · A100 80GB $0.000694 · H100 $0.001097. CPU $0.0000131/core/s, memory $0.00000222/GiB/s. At the L4 price, $30 buys ~37 GPU-hours (before CPU/memory charges).
- **Two separate caps** (Workspace level, all plans):
  - **Usage budget:** caps *total* usage, before credits.
  - **Spend limit:** "a monthly cap on net charges (what you pay out of pocket after credits are applied)". Default: usage limit minus credits (e.g. $100 usage limit with $30 credits gives a $70 spend limit). When it's reached, "Modal stops workloads that would incur additional out-of-pocket charges."
  - So **a spend limit of $30 would allow $30 out of pocket on top of the $30 credit**. To stay at $0, cap usage at $30 or set the spend limit to $0. The docs don't say whether $0 is accepted; check in the UI.
  - Set on the Usage & Billing page (`/settings/usage`). Environment-level budgets are Team/Enterprise only.
- Sources: [pricing](https://modal.com/pricing), [billing](https://modal.com/docs/guide/billing), [budgets](https://modal.com/docs/guide/budgets).

### Ollama
- Runs on the M2 Mac mini (16 GB), reached over the LAN via `OLLAMA_BASE_URL`. Setup: `docs/OLLAMA_MAC_MINI.md`.
- The official macOS build needs **macOS 14+**. The 2017 MacBook (macOS 13.7) is unsupported, short on disk and slow on CPU, so it doesn't run models.
- The OpenAI-compatible endpoint can't set the context size per request, so the server must be started with `OLLAMA_CONTEXT_LENGTH` (we use 16384). Otherwise long prompts are silently truncated at 4096 tokens.
- Sources: [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [FAQ](https://docs.ollama.com/faq), [macOS requirements](https://docs.ollama.com/macos), [tools models](https://ollama.com/search?c=tools).

## What the limits mean for eval runs (rough, to be replaced by measured numbers)

The binding limit is usually **tokens per day**, not requests. Each model call re-sends the system prompt, the tool schemas and the conversation so far.

**Measured on 2026-09-29** (smoke tests + 8 chat conversations, input tokens as reported by the provider):

| Call | Groq gpt-oss-120b | Groq qwen3.8-27b | Gemini 3.8 Flash |
| --- | --- | --- | --- |
| Router | ~420 | not measured | not measured |
| Agent, first step | ~1,260–1,500 | ~2,100–2,200 | ~1,830–1,850 |
| Agent, later steps in a turn | ~1,400–1,800 | ~2,260 | not measured |
| Agent, after a handoff / 2nd turn | ~2,550 | not measured | not measured |

A typical one-turn conversation used **4–6 calls and ~4.5–9K input tokens** on gpt-oss-120b (e.g. order status: router + 3 agent calls = 4,675 input tokens). Qwen's tokenizer counts the same prompt as ~50% more tokens than gpt-oss.

| | Calls per 150-conversation run | Tokens per run | Days per full run at the free limit |
| --- | --- | --- | --- |
| Groq gpt-oss-120b (200K TPD, 8K TPM) | ~600–900 | ~1–1.5M (measured ~4.5–9K per conversation) | **~5–7 days** per model; at 8K TPM, ~3 agent calls/minute, so a multi-step turn can take 1–2 minutes |
| Gemini 3.8 Flash (5 RPM, **20 RPD**) | ~600–900 | ~1.2–3.5M | **~30–45 days** per model at 20 requests/day. Not viable without a change (see PROGRESS.md) |
| Ollama (Mac mini) | ~600–900 | n/a | limited by speed; measured in the smoke test |

What follows from this:
- Keep prompts and tool schemas **lean**. Each agent only gets its own tools, and the Router gets none.
- The record/replay cache and checkpoint/resume are essential, not nice-to-haves.
- The M3 preflight estimate must use **measured** tokens per call, and may need to run cloud models on the ~110 test conversations only, or over several days.
