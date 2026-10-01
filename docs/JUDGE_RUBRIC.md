# LLM judge rubric: `rubric@2` (criteria unchanged from `rubric@1`)

**Status:** approved by Julian (2026-09-30) and in code (`server/src/evals/judge/rubric.ts`). It's versioned like the prompts: every judged result records `rubric@<version>#<hash>`. An edit without a version bump still shows up in the hash.

## Which models judge

The judge IDs live in `config/models.json` → `judges`, not in code.

| Role | Model | What it judges |
| --- | --- | --- |
| **Main judge** | Groq `gpt-oss-20b` (`groq/gpt-oss-20b`) | every conversation in every run |
| ~~Second judge~~ | ~~Gemma 4 31B (`gemini/gemma-4-31b`)~~ | **dropped 2026-10-01** (below) |

**Why the switch (2026-09-30, Julian's decision).** Gemma was the main judge first, because it isn't an agent under test. On `dev-1` its free endpoint was too unreliable to judge a whole run:
- **29% of attempts (29 of 99) ended in HTTP 500s**, each after 4 quick retries
- **~60 s per call** (47–63 s measured), so 120 conversations take about 2 hours

gpt-oss-20b on Groq's paid tier takes ~1 s per call and costs ~$0.02 per 120 conversations.

**The trade-off is family bias.** gpt-oss-20b shares a family with the agent `gpt-oss-120b`, so it might go easier on that model's replies. That's why Gemma, from a family outside that pairing, stays on as the second judge for the 30 check replies. The agreement report shows each judge vs Julian **per agent model**, which is where that bias would appear. The run report also compares the two judges wherever both judged the same conversation (70 conversations on `dev-1`).

**Second judge dropped (2026-10-01, Julian's decision).** Its main purpose was to detect family bias in the main judge, and Julian's 30 blind grades already answer that. On gpt-oss-120b's replies, gpt-oss-20b (`rubric@2`) agreed with Julian on 88% of yes/no answers (23/26), the lowest of the three agent models but within the overlap of their intervals. 2 of its 3 errors there were the judge being *stricter* than Julian, not more lenient. Its helpfulness scores on gpt-oss's replies were +0.30 above Julian's (n = 10), and +0.60 on Qwen's, a model it has no tie to. So there was no sign of favouring its own family. Gemma's endpoint was also failing at the time: of 5 attempts on the first 4 sampled conversations, 4 failed (HTTP 503 "high demand", HTTP 500, no response) and 1 succeeded.
- **What changed:** `judges.second` is optional and no longer set in `config/models.json`. Run reports have no judge-vs-judge section unless a second judge is named. `judge:agreement --second-judge <model>` still works for a one-off check.
- **What stays:** the one Gemma verdict and the earlier `dev-1` Gemma verdicts (`rubric@1`) remain in the saved files.
- **Revisit** if the main judge changes, or if a later agreement check shows the gap on gpt-oss's replies growing.

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

## `rubric@2` (2026-10-01, Julian's fix): one question per call, majority of 3 for two checks
The scoring criteria and the check/script-fit instructions above are unchanged, word for word. What changed is how the judge is asked:
- **One call scores every reply** (tone, clarity, helpfulness).
- **Each yes/no question gets its own call:** each case check, each global check and each script-fit question. The call sees the conversation, the tool results and the case's note on a good answer, but not the other questions.
- **The follow-up-promise and timing checks are asked 3 times; the majority wins.** Each vote's prompt ends "(Independent vote n of 3.)". That makes the three requests different, so the replay cache stores three answers instead of replaying one, and the votes aren't identical at temperature 0. Every vote is saved in the verdict (`votes`).
- The calls for one conversation run in parallel. Each call retries once on invalid output. If any call is still invalid, the verdict is `judge_failed`; a provider error on any call leaves the conversation for a later pass.

**Why:** re-judging `dev-1` after one case check was reworded flipped 6 answers on the unchanged follow-up and timing checks, at temperature 0. Asked together in one call, one question's wording moved the others' answers.

**A mistake in the first version, fixed before any result was used:** that version (`rubric@2#c1b04d7e`) gave the case's note to the scoring call only. The judge then failed Flash-Lite's `returns-02` for mentioning the warranty, which the note explicitly allows. The question calls now get the note too (`rubric@2#611913e3`, the version in use); its verdicts were deleted.

**Cost and reliability on `dev-1`** (gpt-oss-20b, 120 conversations): 924 calls, 0 invalid outputs, **$0.165** (rubric@1: 122 calls, $0.04). The 3 votes split on 4 of 120 follow-up checks and 6 of 120 timing checks; in those, the majority decided.


## `rubric@3` (2026-10-01, Julian): reason before answer, contradictions flagged
- Each yes/no call now returns `{"why": ..., "answer": ...}` with the reason first. The reason must end with exactly "Answer: yes." or "Answer: no.". A reason without that ending is invalid output and gets the usual single retry.
- When a reason's stated conclusion disagrees with its `answer` field, that vote is **flagged, not corrected**. The verdict records the vote numbers (`contradictions`), and the run report lists every flagged answer under "Judge answers that contradict their own reason".
- **Why:** under `rubric@2`, the judge answered "no" with reasons that argued "yes" (dev-1 `refund-over-limit-02`, `returns-03`). Writing the reason first should make the answer follow it, and the flag shows where it didn't.
- **Limit:** the flag catches a conclusion that disagrees with the answer. It can't catch a reason that misreads the conversation and then concludes consistently.
- Criteria, scoring and voting are unchanged from `rubric@2`.
