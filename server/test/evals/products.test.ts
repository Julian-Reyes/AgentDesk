import { describe, expect, it } from "vitest";
import { createProductMatcher, PRODUCT_ALIASES } from "../../src/evals/grading/products.ts";
import { normalize } from "../../src/evals/grading/text.ts";
import { CATALOG } from "../../src/seed/catalog.ts";

const matcher = createProductMatcher(CATALOG);
const ids = (text: string) => matcher.ids(text);

describe("product aliases", () => {
  it("cover every catalog product, and only catalog products", () => {
    expect(Object.keys(PRODUCT_ALIASES).sort()).toEqual(CATALOG.map((p) => p.id).sort());
  });

  it("never give two products the same alias", () => {
    const owner = new Map<string, string>();
    for (const p of CATALOG) {
      for (const a of [p.name, ...PRODUCT_ALIASES[p.id]!]) {
        const key = normalize(a);
        expect(owner.get(key) ?? p.id, `"${a}" is claimed by ${owner.get(key)} and ${p.id}`).toBe(p.id);
        owner.set(key, p.id);
      }
    }
  });

  it("recognizes every product by its full name", () => {
    for (const p of CATALOG) expect(ids(`I like the ${p.name}.`), p.name).toEqual([p.id]);
  });
});

describe("finding products in replies", () => {
  it("prefers the longest name, so a Pro isn't also counted as the plain model", () => {
    expect(ids("The Squall Pro is tougher.")).toEqual(["jacket-squall-pro"]);
    expect(ids("The Squall and the Squall Pro rain jackets")).toEqual(["jacket-squall", "jacket-squall-pro"]);
    expect(ids("Pocket Pro stove vs the Pocket stove")).toEqual(["stove-pocket-pro", "stove-pocket"]);
    expect(ids("Loft Down Jacket or Loft Synthetic Jacket")).toEqual(["jacket-loft-down", "jacket-loft-synthetic"]);
  });

  it("tells temperature-named bags apart, however the temperature is written", () => {
    expect(ids("Ember 0 °C")).toEqual(["bag-ember-0"]);
    expect(ids("the Ember −10°C")).toEqual(["bag-ember-minus10"]);
    expect(ids("Drift -5°C vs Drift 5°C")).toEqual(["bag-drift-minus5", "bag-drift-5"]);
  });

  it("tells same-family products in different categories apart", () => {
    expect(ids("Tundra 2 tent")).toEqual(["tent-tundra-2"]);
    expect(ids("Tundra parka")).toEqual(["jacket-tundra-parka"]);
    expect(ids("Cub 15 pack and a Cub Kids boot")).toEqual(["pack-cub-15", "boot-cub-kids"]);
  });

  it("matches whole words only, and single-word names only when capitalized", () => {
    expect(ids("the Swift 300")).toEqual([]);
    expect(ids("a pocket for your phone, in the spirit of kindling a fire")).toEqual([]);
    expect(ids("I recommend the Nightjar.")).toEqual(["bag-nightjar-quilt"]);
    expect(ids("RIDGE 2 is great")).toEqual(["tent-ridge-2"]);
  });

  it("knows which families take a model number, for spotting invented ones", () => {
    expect(matcher.numberedFamilies.has("Ridge")).toBe(true);
    expect(matcher.numberedFamilies.has("Beacon")).toBe(true);
    expect(matcher.numberedFamilies.has("Squall")).toBe(false);
  });
});
