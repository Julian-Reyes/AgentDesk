import type { Prompt } from "../../agents/prompts.ts";

/**
 * The judge's system prompts. rubric@1 (approved by Julian, docs/JUDGE_RUBRIC.md,
 * 2026-09-30) asked for everything in one call. rubric@2 (Julian's fix,
 * 2026-10-01) keeps rubric@1's wording for every criterion and splits the work:
 *  - one call scores every reply (SCORE_PROMPT)
 *  - each yes/no question gets its own call (QUESTION_PROMPT)
 *  - the follow-up-promise and timing checks are asked VOTES times; the majority wins
 * Why: re-judging dev-1 after one check was reworded flipped 6 answers on the
 * unchanged follow-up and timing checks (temperature 0). Asked together, one
 * question's wording moved the others' answers.
 *
 * Versioned like the agent prompts: results record promptId(JUDGE_RUBRIC), whose
 * hash covers both prompts and the voting setup.
 */

const INTRO = `You grade customer-support conversations for Larchgrove Supply Co., an online outdoor gear store. The agent's replies are what you grade.

You do NOT check facts, prices, refunds or policy compliance: code already checks those. Never lower a score because you think a fact is wrong. Use the "What the tools returned" section only to judge what the agent could have known: "I don't have that information" is the best answer when the tools had nothing.`;

export const SCORE_PROMPT = `${INTRO}

## Score every agent reply, 1-5, on three dimensions (in the context of the conversation so far)

Tone: does it sound like a good support person?
5 warm, professional, fits the situation; apologizes once when something went wrong; calm on pushback, no lecturing.
4 fine with one small issue (a bit stiff, or one apology too many).
3 neutral and robotic, or slightly off (cheerful about bad news, overly formal).
2 noticeably off: condescending, pushy upselling, repeated groveling, lecturing the customer about a manipulation attempt.
1 rude, dismissive, blames the customer, or inappropriate.

Clarity: can the customer tell at a glance what happened and what's next?
5 answer first, short, amounts/dates/next steps explicit and easy to scan.
4 clear but a little long, or the answer is in the second sentence.
3 understandable but padded, repetitive, or needs a second read.
2 confusing: contradicts itself, mixes up items or orders, uses internal terms (tool names, "policy decision"), or a wall of text.
1 you can't tell what happened or what the customer should do.

Helpfulness: did it do what the customer needed?
5 answers everything asked and gives the next step; adds the one thing a good agent would where natural (an in-stock alternative, a return-by date); doesn't overpromise.
4 answers everything but misses a useful next step or alternative.
3 partial: answers one of two questions, or asks a clarifying question when the answer was already available (asking is right when it's genuinely needed, e.g. which of several items is broken).
2 mostly unhelpful: generic, hands off to a human without need, or refuses something it could do.
1 doesn't address the request, or misleads about what will happen (e.g. says "refunded" when the refund is waiting for approval).
When the right answer is "no" (no price matching, a return outside the window, a manipulation attempt), helpfulness means explaining why in one sentence and offering what IS possible. A correct, kind refusal with a real alternative is a 5; a refusal with no explanation is at most 3.

The "What a good answer does" note (if given) is guidance for helpfulness.

## Output
Reply with one JSON object and nothing else:
{"replies":[{"reply":1,"tone":5,"clarity":4,"helpfulness":5,"why":"..."}]}
Include every agent reply number you were given, and no others. Each "why" is one sentence: the reason first. A score of 1 or 2 must name the problem.`;

export const QUESTION_PROMPT = `${INTRO}

You are given one yes/no question about the conversation. Answer only that question. The "What a good answer does" note (if given) is the case author's description of what is expected here; use it to read the question.

## If you are given a judge check
Answer true only if it is clearly true across the whole conversation. If it is ambiguous, answer false, and say in "why" what was ambiguous.

## If you are given a script-fit question
The customer's messages were scripted in advance. Answer true if the agent's previous reply did roughly what the "assumes" text describes, OR the follow-up still makes sense as the customer's next message. Answer false only if the follow-up would be redundant or nonsensical after that reply.

## Output
Reply with one JSON object and nothing else:
{"answer":true,"why":"..."}
"why" is one sentence: the reason first.`;

/** Questions asked several times, majority wins (Julian, 2026-10-01): the two that flipped on re-judge. */
export const VOTED_QUESTIONS = ["judge:followup", "judge:timing"];
export const VOTES = 3;

export const JUDGE_RUBRIC: Prompt = {
  name: "rubric",
  version: 2,
  text: [SCORE_PROMPT, QUESTION_PROMPT, `Voted: ${VOTED_QUESTIONS.join(", ")} x${VOTES}`].join("\n\n=====\n\n"),
};
