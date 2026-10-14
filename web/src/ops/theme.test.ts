import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_KEY, pickTheme } from "./theme.ts";

describe("the dashboard theme", () => {
  it("follows the device until a choice is saved", () => {
    expect([pickTheme(null, true), pickTheme(null, false)]).toEqual(["dark", "light"]);
    expect([pickTheme("light", true), pickTheme("dark", false)]).toEqual(["light", "dark"]);
    expect(pickTheme("purple", true)).toBe("dark");
  });

  it("is set before the first paint by an inline script that uses the same key and rule", () => {
    const html = readFileSync(new URL("../../ops/index.html", import.meta.url), "utf8");
    expect(html).toContain(`localStorage.getItem("${THEME_KEY}")`);
    expect(html).toMatch(/prefers-color-scheme: dark/);
    expect(html).toMatch(/classList\.add\("dark"\)/);
  });
});
