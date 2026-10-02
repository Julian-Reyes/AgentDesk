import { describe, expect, it } from "vitest";
import { href, parseRoute } from "./route.ts";

describe("dashboard routes", () => {
  it("top-level pages, approvals by default", () => {
    expect(parseRoute("")).toEqual({ page: "approvals" });
    expect(parseRoute("#/nonsense/x/y")).toEqual({ page: "approvals" });
    for (const p of ["agents", "comparison", "runs", "evals"]) expect(parseRoute(`#/${p}`)).toEqual({ page: p });
  });

  it("round-trips ids, including model ids with a slash", () => {
    expect(parseRoute(href.run("1b2c-uuid"))).toEqual({ page: "run", id: "1b2c-uuid" });
    expect(parseRoute(href.evalRun("dev-3-r2a"))).toEqual({ page: "evalRun", run: "dev-3-r2a" });
    expect(href.evalConversation("dev-3-r2a", "groq/gpt-oss-120b", "refund-over-limit-01")).toBe("#/evals/dev-3-r2a/groq%2Fgpt-oss-120b/refund-over-limit-01");
    expect(parseRoute(href.evalConversation("dev-3-r2a", "groq/gpt-oss-120b", "refund-over-limit-01"))).toEqual({ page: "evalConversation", run: "dev-3-r2a", model: "groq/gpt-oss-120b", caseId: "refund-over-limit-01" });
  });
});
