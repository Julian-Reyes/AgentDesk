import { describe, expect, it } from "vitest";
import { staticPath } from "./static-path.ts";

describe("staticPath: where the public snapshot keeps each API response", () => {
  it("maps paths and sorted query parameters to one file each", () => {
    expect(staticPath("/api/overview")).toBe("api/overview.json");
    expect(staticPath("/api/approvals?status=pending")).toBe("api/approvals/status~pending.json");
    const a = staticPath("/api/eval-runs/test-1/conversation?model=groq%2Fgpt-oss-120b&case=test-adversarial-01");
    const b = staticPath("/api/eval-runs/test-1/conversation?case=test-adversarial-01&model=groq/gpt-oss-120b");
    expect(a).toBe("api/eval-runs/test-1/conversation/case~test-adversarial-01/model~groq__gpt-oss-120b.json");
    expect(b).toBe(a);
    expect(staticPath("/api/comparison/dev-round-2")).toBe("api/comparison/dev-round-2.json");
  });

  it("refuses non-API paths and segments that would leave the folder", () => {
    expect(() => staticPath("/ops/")).toThrow();
    expect(() => staticPath("/api/../../etc/passwd")).toThrow();
    // An encoded ".." is resolved by the URL parser first, so the file stays inside api/.
    expect(staticPath("/api/eval-runs/%2E%2E/conversations")).toBe("api/conversations.json");
  });
});
