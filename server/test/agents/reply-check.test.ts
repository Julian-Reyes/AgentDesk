import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkReplyText } from "../../src/agents/reply-check.ts";

describe("checkReplyText: garbled replies", () => {
  it("flags the two garbled qwen3.8-27b replies from dev-1", () => {
    expect(checkReplyText("Here's how they compare — both are tiny screw-on stoves for isobutane canisters: ←SKILL1←Kettle Pro Canister Stove")).toEqual({
      ok: false,
      reason: "junk",
      detail: 'contains garbled text "←SKILL1←"',
    });
    expect(checkReplyText("Here's the quote for a Swift 30 Daypack ($119.00) + Pocket Pro Canister Stove ($55.00):")).toEqual({
      ok: false,
      reason: "cut_off",
      detail: 'stops mid-sentence (ends with ":")',
    });
  });

  it("flags leaked special tokens, tags, broken encoding and control characters", () => {
    for (const text of ["Sure thing!<|im_end|>", "[TOOL_CALLS] reply", "<think>the customer wants</think> Hi!", "Price: $12.00 ��", "Hello\u0007 there.", "Order <EOS> shipped."]) {
      expect(checkReplyText(text), text).toMatchObject({ ok: false, reason: "junk" });
    }
  });

  it("flags output the provider cut at its length limit, and text ending on a comma, bracket or dash", () => {
    expect(checkReplyText("Your order shipped on Sep 12 and", "length")).toMatchObject({ ok: false, reason: "cut_off", detail: "was cut off at the output length limit" });
    for (const text of ["The Ridge 2 costs $199.20,", "Two options (", "Totals —"]) {
      expect(checkReplyText(text), text).toMatchObject({ ok: false, reason: "cut_off" });
    }
    // Ending on a word isn't flagged, even when it's probably cut off: too many good replies end that way.
    expect(checkReplyText("The Ridge 2 costs $199.20, and the")).toEqual({ ok: true });
  });

  it("leaves ordinary replies alone", () => {
    for (const text of [
      "Let me know if there's anything else I can help with",
      "- Ridge 2: $199.20\n- Canopy 2: $151.20",
      "SUMMER10 (10% off orders over $100) is valid until Sep 30.",
      "Use code SUMMER10 at checkout 🙂",
      "Note: worn items can't be returned.",
      "Your total is $358.56 (with SUMMER10).",
      "Order #1042 → shipped → out for delivery.",
    ]) {
      expect(checkReplyText(text), text).toEqual({ ok: true });
    }
  });

  it("flags only the two garbled replies among every agent reply saved in pilot-1 and dev-1", () => {
    const runs = join(import.meta.dirname, "../../eval-results/runs");
    const flagged: string[] = [];
    let replies = 0;
    for (const run of ["pilot-1", "dev-1"]) {
      for (const model of readdirSync(join(runs, run, "conversations"))) {
        for (const file of readdirSync(join(runs, run, "conversations", model))) {
          const record = JSON.parse(readFileSync(join(runs, run, "conversations", model, file), "utf8"));
          for (const step of record.observation.steps) {
            if (step.kind !== "reply" || step.agent === "router") continue;
            replies += 1;
            if (!checkReplyText(step.data.message).ok) flagged.push(`${run}/${model}/${file}`);
          }
        }
      }
    }
    expect(replies).toBeGreaterThan(100);
    expect(flagged.sort()).toEqual(["dev-1/groq__qwen3.8-27b/comparison-02.json", "dev-1/groq__qwen3.8-27b/price-deals-04.json"]);
  });
});
