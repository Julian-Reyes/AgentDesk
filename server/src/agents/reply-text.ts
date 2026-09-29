/**
 * Models sometimes put the reply tool's *arguments* into the message itself,
 * so the customer would see raw JSON like {"message":"I'm sorry…"}. This
 * happened on 2026-09-29 with gpt-oss-120b, which answered in plain text
 * instead of calling reply, and the text was the reply tool's arguments.
 *
 * If the text is a JSON object (optionally in a ```json fence) with a string
 * `message`, only the message is delivered. Anything else is left untouched,
 * so a normal reply that merely contains braces is never altered. The loop
 * traces `unwrapped: true`, so the evals still count the model's mistake.
 */
export function unwrapReplyText(text: string): { text: string; unwrapped: boolean } {
  let candidate = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(candidate);
  if (fence) candidate = fence[1]!.trim();
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) return { text, unwrapped: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { text, unwrapped: false };
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const message = (parsed as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      // Unwrap again in case the model double-wrapped it.
      return { text: unwrapReplyText(message).text.trim(), unwrapped: true };
    }
  }
  return { text, unwrapped: false };
}
