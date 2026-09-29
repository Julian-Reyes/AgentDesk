# Free tiers: checked 2026-09-29

Limits change often. Re-check before each real eval run, and trust the provider's own dashboard over this file.
Every number below comes from the provider's **official docs**. Third-party blog numbers are not used.

## Summary

| Provider | Status | OpenAI-compatible? | Tool calling | Free limits (per model) | Data use on free tier |
| --- | --- | --- | --- | --- | --- |
| **Gemini API** (Google AI Studio) | ✅ available | ✅ beta, `https://generativelanguage.googleapis.com/v1beta/openai/` | ✅ `tools`, `tool_choice` | **Not published in the official docs.** They're only shown per account in AI Studio → Rate limits. **Unknown until a key exists.** | Used to improve Google products; **human reviewers may read inputs/outputs** (outside EEA/CH/UK). Fine for us: all data is fictional. |
| **Groq** | ✅ available | ✅ `https://api.groq.com/openai/v1` | ✅ all hosted models | `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`: **30 RPM, 1,000 RPD, 8K TPM, 200K TPD** | Not retained by default (up to 30 days for abuse monitoring). |
| **GitHub Models** | ❌ **retired 2026-07-30** | n/a | n/a | n/a | n/a |
| **Cerebras** | ❌ **no permanent free tier**: a **$5 trial** that needs a **verified payment method** and **expires 30 days** after it's granted. | not checked | not checked | Trial: `gpt-oss-120b`, `qwen-3.8-27b` at 5 RPM, 30K TPM, 1M tokens/day | Not checked. Possible **paid** provider later (needs approval + cost estimate first). |
| **OpenRouter free models** | ✅ available | ✅ | ✅ (some models) | `:free` models: 20 RPM, **50 requests/day** below 10 purchased credits (1,000/day at 10+) | Too small for eval runs. |
| **Ollama (on the Mac mini)** | ✅ runs on the M2 Mac mini on the home network | ✅ `http://<mac-mini>:11434/v1/` | ✅ `tools` (`tool_choice` is **not** supported) | Unlimited; limited by hardware. Default context window is **4096 tokens** unless `OLLAMA_CONTEXT_LENGTH` is set | Stays on the home network. |
| **Modal** (vLLM) | planned for official evals + demo; **not signed up** | ✅ via vLLM's OpenAI-compatible server | ✅ depends on vLLM's tool-call parser for the model | Starter plan: **$30/month free compute credit**. **Payment method required.** Billed per second (e.g. L4 GPU $0.000222/s ≈ $0.80/h) | not checked |
| **Ollama Cloud** | optional, not checked | ✅ `https://ollama.com/v1/` | ✅ | not checked | not checked |

**Comparison lineup (decided 2026-09-29):** Gemini Flash · Groq `openai/gpt-oss-120b` (the "GPT" slot, replacing GitHub Models) · Groq `qwen/qwen3.8-27b` (large open model) · a small open model (developed on Ollama on the Mac mini; **official eval runs and the public demo serve it with vLLM on Modal**; Modal's pricing/free terms are not checked yet). Groq's limits are per model, so the two Groq models don't share a quota.

## Details and sources

### Gemini API
- The official rate-limits page says limits "depend on a variety of factors" and points to AI Studio instead of listing numbers.
- OpenAI compatibility is "still in beta"; parameters it doesn't support are **silently ignored**, and reasoning can't be turned off for some models.
- Pro models have no free tier. The free models are Flash / Flash-Lite (e.g. `gemini-3.8-flash`, `gemini-3.5-flash-lite`) plus older 2.5 models.
- **TODO (Julian):** open AI Studio → Rate limits once a key exists and paste the real numbers for the chosen model here. Until then, Gemini run-time estimates are unknown.
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

The binding limit is usually **tokens per day**, not requests. Each model call re-sends the system prompt, the tool schemas and the conversation so far. Measured so far: each agent's tool schemas are ~3.8K characters (≈1K tokens). A rough guess for a whole call is ~2,000–4,000 input tokens, with ~4–6 calls per conversation (router + agent steps).

| | Calls per 150-conversation run | Tokens per run | Days per full run at the free limit |
| --- | --- | --- | --- |
| Groq (200K TPD, per model) | ~600–900 | ~1.2–3.5M | **~6–18 days** per model |
| Gemini Flash | ~600–900 | ~1.2–3.5M | unknown until AI Studio shows the account's limits |
| Ollama (Mac mini) | ~600–900 | n/a | limited by speed; measured in the smoke test |

What follows from this:
- Keep prompts and tool schemas **lean**. Each agent only gets its own tools, and the Router gets none.
- The record/replay cache and checkpoint/resume are essential, not nice-to-haves.
- The M3 preflight estimate must use **measured** tokens per call, and may need to run cloud models on the ~110 test conversations only, or over several days.
