import { ALL_TOOLS } from "../../tools/registry.ts";

/**
 * Text helpers shared by the graders and the grounding checker. Replies are
 * free text, so matching has to tolerate the ways models write the same thing:
 * curly quotes, dashes, "0 °C" vs "0°C", "$151.2" vs "$151.20".
 */

/**
 * Normalizes punctuation and spacing but keeps letter case (product names are
 * matched case-sensitively in some places). Lowercase it yourself when needed.
 */
export function normalizeKeepCase(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-") // hyphens, en/em dashes, minus sign
    .replace(/\s+/g, " ")
    .replace(/(\d)\s*(?:°|º|degrees?)\s*([CF])\b/gi, (_, d: string, u: string) => `${d}°${u.toUpperCase()}`)
    .trim();
}

export const normalize = (text: string) => normalizeKeepCase(text).toLowerCase();

/** Case-insensitive, whitespace- and punctuation-tolerant "contains". */
export function containsPhrase(text: string, phrase: string): boolean {
  return normalize(text).includes(normalize(phrase));
}

/** True if the text contains any of the alternatives. */
export const containsAny = (text: string, alternatives: string[]) => alternatives.some((a) => containsPhrase(text, a));

const DOLLAR = /(?<![\w.])-?\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d)/g;
const WORDED = /(?<![\w.$])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(?:USD|dollars)\b/gi;

/**
 * Every dollar amount in the text, in cents (sign dropped: "-$139.44" is a
 * discount of 13944). "$151.2", "$151.20" and "151.20 USD" all give 15120.
 */
export function parseAmounts(text: string): number[] {
  const out: number[] = [];
  const add = (whole: string, frac: string | undefined) => out.push(Number(whole.replaceAll(",", "")) * 100 + Number((frac ?? "0").padEnd(2, "0")));
  for (const m of text.matchAll(DOLLAR)) add(m[1]!, m[2]);
  for (const m of text.matchAll(WORDED)) add(m[1]!, m[2]);
  return out;
}

// Tool names with an underscore can't be ordinary words; `reply`/`handoff` only count as syntax with a parenthesis.
const TOOL_NAMES = ALL_TOOLS.map((t) => t.name).filter((n) => n.includes("_"));
const RAW_OUTPUT_PATTERNS: Array<[RegExp, string]> = [
  [/^\s*[{[]/, "starts with JSON"],
  [/\{\s*"[A-Za-z_]\w*"\s*:/, "a JSON object"],
  [/```\s*(?:json)?\s*[{[]/i, "a fenced JSON block"],
  [/<\|[a-z_]+\|>/i, "a model control token"],
  [/<\/?(?:tool_call|tool|function)[^>]*>/i, "a tool-call tag"],
  [/\bfunctions\.[a-z_]+|\bto=functions\b|\bdefault_api\s*[.:]/, "a function-call prefix"],
  [/\b(?:reply|handoff)\s*[({]/, "a tool call"],
  // name{key: …}: a tool call written out with unquoted keys (test-1, Flash-Lite: "Ibruf:default_api:reply{message:…")
  [/\b[A-Za-z_]\w*\s*\{\s*[A-Za-z_]\w*\s*:/, "an unquoted tool-call object"],
  [new RegExp(`\\b(?:${TOOL_NAMES.join("|")})\\b`), "a tool name"],
];

/** Why a reply looks like raw model/tool output instead of text for a customer, or [] if it doesn't. */
export function rawOutputProblems(text: string): string[] {
  return RAW_OUTPUT_PATTERNS.filter(([re]) => re.test(text)).map(([, why]) => why);
}
