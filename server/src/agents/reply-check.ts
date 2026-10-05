/**
 * A last check on a reply before the customer sees it: is it garbled?
 *
 * Found on dev-1 (2026-10-01, Julian's grading): qwen3.8-27b sent
 *   "…both are tiny screw-on stoves for isobutane canisters: ←SKILL1←Kettle Pro Canister Stove"
 * (a leaked marker, then the reply stops), and another reply that ended at
 *   "…Pocket Pro Canister Stove ($55.00):"
 * with the quote it announced missing.
 *
 * Built for precision: a false alarm costs a retry and, if the retry is flagged
 * too, replaces a fine reply with the failure message. So it only looks for
 * things no good reply contains:
 *  - junk: marker-like tokens (←SKILL1←, <|im_end|>, [TOOL_CALLS], <think>),
 *    the Unicode replacement character, control characters, and a tool call
 *    written out as text (test-1, 2026-10-05: Flash-Lite delivered
 *    "Ibruf:default_api:reply{message:Coupon WELCOME5 could not be applied…")
 *  - cut off: the provider says the output hit its length limit, or the text
 *    ends on a colon, comma, open bracket or dash (announcing something that
 *    never comes)
 * A reply that ends on a word ("…anything else I can help with") is not cut off.
 * On every saved reply in pilot-1 and dev-1 (138) it flags exactly the two above; on all
 * 1,305 saved replies through test-1, the tool-call patterns flag only the test-1 one.
 *
 * Invented products (the "Kettle Pro" above) are the grounding check's job, not this one's.
 */

export type GarbledReason = "junk" | "cut_off";
export type ReplyCheck = { ok: true } | { ok: false; reason: GarbledReason; detail: string };

const JUNK: RegExp[] = [
  // An ALL-CAPS token between marker characters: ←SKILL1←, [TOOL_CALLS], <EOS>, |END|
  /[←→↑↓⟨⟩‹›«»<[|｜]{1,2}\s?[A-Z][A-Z0-9_]{2,}\s?[←→↑↓⟨⟩‹›«»>\]|｜]{1,2}/u,
  // Chat-template special tokens: <|im_end|>, <｜end▁of▁sentence｜>
  /<\|[^|\n]{0,40}\|>|<｜|｜>/u,
  // Reasoning / tool-call tags leaking into the text
  /<\/?(?:think|tool_call|function_call|function|im_start|im_end)\b/i,
  // The replacement character (broken encoding) and control characters other than tab/newline
  /\uFFFD|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u,
  // A tool call written out as text: a provider's tool namespace ("default_api:", "functions.";
  // not "functions:", which is prose: "two functions: red and white"),
  // or name{key: …} with unquoted keys. Each matched only that one reply among the 1,305 saved ones.
  /\bdefault_api\s*[.:]\s*\w+|\bfunctions\.\w+/,
  /\b[A-Za-z_]\w*\s*\{\s*[A-Za-z_]\w*\s*:/,
];

const CUT_OFF_END = /[:,([—–]\s*$/u;

export function checkReplyText(text: string, finishReason?: string): ReplyCheck {
  for (const pattern of JUNK) {
    const m = pattern.exec(text);
    if (m) return { ok: false, reason: "junk", detail: `contains garbled text ${JSON.stringify(m[0])}` };
  }
  if (finishReason === "length") return { ok: false, reason: "cut_off", detail: "was cut off at the output length limit" };
  if (CUT_OFF_END.test(text.trim())) return { ok: false, reason: "cut_off", detail: `stops mid-sentence (ends with ${JSON.stringify(text.trim().slice(-1))})` };
  return { ok: true };
}

/** What the model is told when its reply was held back, so the retry can fix it. */
export const garbledReplyFeedback = (detail: string) =>
  `Your reply was NOT sent to the customer: it ${detail}. Send the complete reply again with the reply tool, in plain sentences.`;
