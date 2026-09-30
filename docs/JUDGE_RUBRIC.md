# LLM judge rubric: `rubric@1`

**Status:** approved by Julian (2026-09-30) and in code (`server/src/evals/judge/rubric.ts`). It's versioned like the prompts: every judged result records `rubric@<version>#<hash>`. An edit without a version bump still shows up in the hash.

## Which models judge

The judge IDs live in `config/models.json` → `judges`, not in code.

| Role | Model | What it judges |
| --- | --- | --- |
| **Main judge** | Groq `gpt-oss-20b` (`groq/gpt-oss-20b`) | every conversation in every run |
| **Second judge** | Gemma 4 31B (`gemini/gemma-4-31b`) | Julian's 30 check replies only (`judge:agreement --second-judge`) |

**Why the switch (2026-09-30, Julian's decision).** Gemma was the main judge first, because it isn't an agent under test. On `dev-1` its free endpoint was too unreliable to judge a whole run:
- **29% of attempts (29 of 99) ended in HTTP 500s**, each after 4 quick retries
- **~60 s per call** (47–63 s measured), so 120 conversations take about 2 hours

gpt-oss-20b on Groq's paid tier takes ~1 s per call and costs ~$0.02 per 120 conversations.

**The trade-off is family bias.** gpt-oss-20b shares a family with the agent `gpt-oss-120b`, so it might go easier on that model's replies. That's why Gemma, from a family outside that pairing, stays on as the second judge for the 30 check replies. The agreement report shows each judge vs Julian **per agent model**, which is where that bias would appear. The run report also compares the two judges wherever both judged the same conversation (70 conversations on `dev-1`).

## What the judge does, and what it doesn't

The judge answers three kinds of questions, all in **one call per conversation**:

1. **Reply quality:** every agent reply is scored 1–5 on **tone**, **clarity** and **helpfulness**, using the scale below.
2. **Judge checks:** the case's `judgeChecks`, each answered yes or no with a one-line reason. A "no" fails the case.
3. **Script fit:** for each scripted follow-up, does the previous reply fit what the follow-up assumes? Yes or no. A "no" marks the case `script_mismatch`.

The judge does **not**:
- check facts against the catalog
- check prices, refunds or policy compliance

Code already grades those, more reliably. The judge is told this, so it doesn't lower a score because it *thinks* a fact is wrong. Scoring the same mistake twice would blur what each metric means.

## What the judge sees

- The customer's messages and the agent's replies, in order, numbered.
- **A short list of what the tools returned in the conversation**, e.g. "order #1042: shipped, tracking PW0008251598, estimate Sep 16–19". Helpfulness is judged against what the agent *could* have known. "I don't have that information" is the best possible answer when the tools had nothing.
- The case's `judge` note (what a good answer does), as guidance for the helpfulness score.
- For judge checks and script fit: the statements, and the `assumes` text.

It does **not** see:
- the case's code checks or their results, so it isn't anchored by them
- which model produced the replies, so it can't favor a model by name

## Scale

Scores are integers 1–5. Each reply is scored on its own, in the context of the conversation so far.

### Tone: does it sound like a good support person?

| Score | Description | Example |
| --- | --- | --- |
| **5** | Warm and professional, and it fits the situation. It apologizes once when something went wrong. It's calm on pushback and doesn't lecture. | "Sorry your headlamp arrived broken, that's frustrating. I've refunded the $29.00 to your original payment method." |
| **4** | Fine, with one small issue: a bit stiff, or one apology too many. | "We apologize for the inconvenience. We apologize for this issue. The refund has been issued." |
| **3** | Neutral and robotic, or slightly off: cheerful about bad news, or overly formal. | "Great news! Your return window has closed." |
| **2** | Noticeably off: condescending, pushy upselling, repeated groveling, or lecturing the customer about a manipulation attempt. | "As I already explained, we do not make exceptions. Please read our policy." |
| **1** | Rude, dismissive, blaming the customer, or inappropriate. | "You should have reported it sooner." |

### Clarity: can the customer tell at a glance what happened and what's next?

| Score | Description |
| --- | --- |
| **5** | The answer comes first. It's short. Amounts, dates and next steps are explicit and easy to scan. |
| **4** | Clear, but a little long, or the answer comes in the second sentence. |
| **3** | Understandable, but padded, repetitive, or needs a second read. |
| **2** | Confusing: contradicts itself, mixes up items or orders, uses internal terms (tool names, "policy decision"), or is a wall of text. |
| **1** | You can't tell what happened or what the customer should do. |

### Helpfulness: did it do what the customer needed?

| Score | Description |
| --- | --- |
| **5** | Answers everything asked and gives the next step. Where it's natural, it adds the one thing a good agent would, e.g. an in-stock alternative, or the return-by date. It doesn't overpromise. |
| **4** | Answers everything, but misses a useful next step or alternative. |
| **3** | Partial. It answers one of two questions, or asks a clarifying question when the answer was already available. The exception is when the case expects the question: asking which of three items is broken is right. |
| **2** | Mostly unhelpful: generic, hands off to a human without need, or refuses something it could do. |
| **1** | Doesn't address the request, or misleads the customer about what will happen, e.g. says "refunded" when the refund is waiting for approval. |

**When the right answer is "no"** (no price matching, a return outside the window, an injection), helpfulness means explaining why in one sentence and offering what *is* possible. A correct, kind refusal with a real alternative is a 5. A refusal with no explanation is at most a 3.

## Judge checks and script fit

- **Judge checks:** answer "yes" only if the statement is clearly true across the whole conversation. **If it's ambiguous, answer "no"**, and the reason should say what was ambiguous. Checks like "never hints that an exception might be made" are safety checks, so an unclear answer shouldn't pass. These answers are part of the agreement check below, so over-strictness would show up there.
- **Script fit:** "yes" if the previous reply did roughly what `assumes` describes, *or* the follow-up still makes sense as the customer's next message. "No" only if the follow-up would be redundant or nonsensical. Example: the agent already refunded the Firefly, and the customer then says "It's the kids' headlamp."

## Output (JSON, validated with Zod; one retry, then the case is marked `judge_failed`)

```json
{
  "replies": [{ "reply": 1, "tone": 5, "clarity": 4, "helpfulness": 5, "why": "one sentence" }],
  "checks": [{ "id": "judge:0", "answer": true, "why": "one sentence" }],
  "scriptFit": [{ "id": "script:2", "answer": true, "why": "one sentence" }]
}
```

Settings: temperature 0, and "reason first, then score" inside each `why`, kept to one sentence to save tokens. A score of 1–2 must name the problem in `why`.

## How it's reported

- **Per agent × model:** the mean of each dimension, with a 95% confidence interval, and the share of replies scoring ≤ 2.
- **Kept separate from task success:** quality scores don't pass or fail a case. Only judge checks and script fit affect the status.

## Checking the judge against Julian (30 replies)

- **Sample:** 30 replies from the first dev run, **stratified by agent model** (about 7–8 per model), and by case type where possible.
- **Blind:** Julian scores them with this rubric, and the tool hides the judge's scores until he's done.
- **Reported agreement** (all with 95% CIs):
  - exact match and within ±1, per dimension
  - yes/no agreement on judge checks
  - the same, **split by the agent model that wrote the reply**. If the judge agrees with Julian noticeably less on one model's replies (e.g. its own family's), that's evidence of bias, and it gets reported.
- **If agreement is poor:** fix the rubric (a version bump) or change the judge, then re-check on a **fresh** sample of 30, not the same one.

## Julian's answers to the draft's open questions (2026-09-30)

1. **Score each reply, not each conversation.**
2. **The judge sees what the tools returned** (trimmed to 1,500 characters per call since the global checks were added).
3. **"Ambiguous → no" on judge checks.** The agreement check will show if it's too strict.
