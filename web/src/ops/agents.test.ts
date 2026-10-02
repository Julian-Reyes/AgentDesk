import { describe, expect, it } from "vitest";
import type { ModelOption } from "../lib/api.ts";
import { costWarning, describeChange, liveRows, ms, pct, retireTargets, switchTargets, tokens, usd } from "./agents.ts";

const model = (id: string, paid = false): ModelOption => ({ id, provider: id.split("/")[0]!, paid, pricing: paid ? { inputPerMTok: 0.15, outputPerMTok: 0.6 } : { inputPerMTok: 0, outputPerMTok: 0 } });
const MODELS = [model("gemini/lite"), model("groq/oss", true), model("groq/qwen", true)];

describe("agents display", () => {
  it("formats numbers", () => {
    expect([ms(420), ms(1834), ms(null)]).toEqual(["420 ms", "1.8 s", "–"]);
    expect([usd(0), usd(12345), usd(null)]).toEqual(["$0 (free)", "$0.0123", "–"]);
    expect([pct(0.256), pct(null)]).toEqual(["26%", "–"]);
    expect([tokens(999), tokens(12_400), tokens(3_400_000)]).toEqual(["999", "12K", "3.4M"]);
  });

  it("describes every kind of change", () => {
    expect(describeChange({ action: "initial", model: "a", fromModel: null, toModel: "a" })).toBe("Started with a");
    expect(describeChange({ action: "switch", model: "b", fromModel: "a", toModel: "b" })).toBe("Switched a → b");
    expect(describeChange({ action: "retire", model: "a", fromModel: "a", toModel: "b" })).toBe("Retired a, replaced by b");
    expect(describeChange({ action: "retire", model: "c", fromModel: "a", toModel: "a" })).toBe("Retired c");
    expect(describeChange({ action: "reinstate", model: "c", fromModel: "a", toModel: "a" })).toBe("Reinstated c");
  });

  it("offers only valid targets", () => {
    const role = { model: "gemini/lite", retired: ["groq/qwen"] };
    expect(switchTargets(role, MODELS).map((m) => m.id)).toEqual(["groq/oss"]);
    expect(retireTargets(role, MODELS).map((m) => m.id)).toEqual(["gemini/lite", "groq/oss"]);
  });

  it("warns before a paid model, not a free one", () => {
    expect(costWarning(MODELS[1])).toMatch(/paid model.*\$8\/month Groq cap/);
    expect(costWarning(MODELS[0])).toBeNull();
    expect(costWarning(undefined)).toBeNull();
  });

  it("puts the current model's live numbers first", () => {
    const row = (m: string) => ({ model: m }) as any;
    expect(liveRows({ model: "b", live: [row("a"), row("b")] }).map((r) => r.model)).toEqual(["b", "a"]);
  });
});
