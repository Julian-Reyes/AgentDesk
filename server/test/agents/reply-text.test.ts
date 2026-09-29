import { describe, expect, it } from "vitest";
import { unwrapReplyText } from "../../src/agents/reply-text.ts";

describe("unwrapReplyText", () => {
  it("unwraps the exact leak seen on 2026-09-29", () => {
    expect(unwrapReplyText('{"message":"I’m sorry, but I can’t fulfill that request."}')).toEqual({
      text: "I’m sorry, but I can’t fulfill that request.",
      unwrapped: true,
    });
  });

  it("handles code fences, whitespace, extra keys and double wrapping", () => {
    expect(unwrapReplyText('```json\n{"message": "Hi!"}\n```').text).toBe("Hi!");
    expect(unwrapReplyText('  {"message":"Hi!","to":"support"}  ').text).toBe("Hi!");
    expect(unwrapReplyText('{"message":"{\\"message\\":\\"Hi!\\"}"}').text).toBe("Hi!");
  });

  it("leaves normal replies alone, including ones that contain braces or JSON-like text", () => {
    for (const text of [
      "Your order #1042 has shipped.",
      "Use code {SUMMER10} at checkout.",
      '{"route":"support"}', // JSON, but not a reply: left as is (and visible in evals)
      '{"message": ""}',
      "{not json}",
      '["message"]',
    ]) {
      expect(unwrapReplyText(text)).toEqual({ text, unwrapped: false });
    }
  });
});
