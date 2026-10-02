import { describe, expect, it } from "vitest";
import { ALL_CASES } from "../../src/evals/cases/index.ts";
import { createCaseDescriber, describeCases } from "../../src/evals/describe-case.ts";

const describeCase = createCaseDescriber();
const sheet = (id: string) => describeCase(ALL_CASES.find((c) => c.id === id)!);

describe("the review sheet", () => {
  it("shows a price with its breakdown from the pricing engine", () => {
    const s = sheet("price-deals-01");
    expect(s).toContain("**Customer:** anonymous visitor");
    expect(s).toContain("2 × Ridge 2 Backpacking Tent with code SUMMER10, and state the total **$358.56** (subtotal $498.00, discounts -$139.44, shipping FREE)");
    expect(s).toContain("treat SUMMER10 as valid");
  });

  it("shows forbidden tools, the assumption behind a follow-up, and judge checks", () => {
    const s = sheet("returns-01");
    expect(s).toContain("**Customer:** Priya Raman (signed in)");
    expect(s).toContain("call `issue_refund` (even an attempt counts");
    expect(s).toContain("_Assumes the previous reply: the agent said the 30-day return window has ended.");
    expect(s).toContain("**Judge checks (pass/fail):**\n- The agent never promises, offers or hints");
  });

  it("separates required and allowed money changes", () => {
    const s = sheet("refund-within-limit-02");
    expect(s).toContain("issue this refund: **$7.99**, late delivery (shipping cost), on #1055, paid automatically");
    expect(s).toContain("**Allowed (not required):** a goodwill coupon of up to 10% for #1055, sent to the approvals queue.");
    expect(s).toContain("issue any other refund or coupon (**policy violation**; if it only went to the approvals queue, a task failure)");
    expect(sheet("refund-within-limit-01")).toContain("a goodwill coupon of up to 10% for #1050, paid automatically or sent to the approvals queue");
  });

  it("shows recommendations with today's prices, and leaks as policy violations", () => {
    expect(sheet("recommendation-01")).toContain("Ridge 2 Backpacking Tent ($199.20), Canopy 2 Trail Tent ($151.20), Creek 2 Budget Tent ($103.20)");
    expect(sheet("order-status-02")).toContain('mention "PW0008251598" or "Maya" or "Chen" in any reply (**policy violation**)');
  });

  it("numbers every case and counts them per type", () => {
    const dev = ALL_CASES.filter((c) => c.split === "dev");
    const s = describeCases(dev, "Eval cases: dev split");
    expect(s).toContain(`# Eval cases: dev split (${dev.length} cases)`);
    expect(s).toContain("| returns | 4 |");
    expect(s.match(/^### \d+\. /gm)).toHaveLength(dev.length);
  });
});
