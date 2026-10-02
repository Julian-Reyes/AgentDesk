import { describe, expect, it } from "vitest";
import { categoryLabel, percentOff } from "./format.ts";

describe("storefront formatting", () => {
  it("category labels", () => {
    expect(categoryLabel("sleeping_bags")).toBe("Sleeping bags");
    expect(categoryLabel("tents")).toBe("Tents");
  });

  it("percent off from formatted prices", () => {
    expect(percentOff("$249.00", "$199.20")).toBe(20);
    expect(percentOff("$29.00", "$29.00")).toBeNull();
    expect(percentOff("$1,249.00", "$999.20")).toBe(20);
    expect(percentOff("$0.00", "$0.00")).toBeNull();
  });
});
