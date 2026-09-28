import { describe, expect, it } from "vitest";
import { as, call, inTx, MAYA } from "../helpers.ts";

describe("search_products", () => {
  it("finds 2-person tents under $200 by the price paid today (sale included)", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "search_products", {
        query: "tent",
        filters: { category: "tents", minCapacityPersons: 2, maxPrice: 200 },
      })) as any;
      expect(r.ok).toBe(true);
      const ids = r.data.products.map((p: any) => p.id).sort();
      // Ridge 2 is $249.00 list but $199.20 during the 20% tent sale, so it qualifies.
      expect(ids).toEqual(["tent-canopy-2", "tent-creek-2", "tent-ridge-2"]);
      const ridge = r.data.products.find((p: any) => p.id === "tent-ridge-2");
      expect(ridge).toMatchObject({ listPrice: "$249.00", currentPrice: "$199.20" });
      expect(ridge).not.toHaveProperty("price");
      expect(ridge.activeDeals).toContain("Tent Sale: 20% off all tents");
    }));

  it("maxPrice is inclusive at the current price, to the cent", () =>
    inTx(async (tx) => {
      const ids = async (maxPrice: number) =>
        ((await call(tx, "search_products", { filters: { category: "tents", maxPrice } })) as any).data.products.map((p: any) => p.id);
      expect(await ids(199.2)).toContain("tent-ridge-2");
      expect(await ids(199.19)).not.toContain("tent-ridge-2");
    }));

  it("minPrice also uses the current price", () =>
    inTx(async (tx) => {
      // Ridge 2 is $249 list, but only $199.20 today, so it's excluded from "$200 and up".
      const r = (await call(tx, "search_products", { filters: { category: "tents", minPrice: 200 } })) as any;
      expect(r.data.products.map((p: any) => p.id)).not.toContain("tent-ridge-2");
      expect(r.data.products.map((p: any) => p.id)).toContain("tent-basecamp-4"); // $279 → $223.20
    }));

  it("products not on sale have currentPrice equal to listPrice (a single headlamp gets no buy-2-get-1 discount)", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "search_products", { query: "glowworm 300" })) as any;
      expect(r.data.products[0]).toMatchObject({ id: "lamp-glowworm-300", listPrice: "$29.00", currentPrice: "$29.00" });
      const stove = (await call(tx, "search_products", { query: "quickboil" })) as any;
      expect(stove.data.products[0]).toMatchObject({ listPrice: "$129.00", currentPrice: "$129.00" }); // stove sale has ended
    }));

  it("currentPrice matches quote_price for one unit", () =>
    inTx(async (tx) => {
      const search = (await call(tx, "search_products", { filters: { category: "tents" }, limit: 20 })) as any;
      for (const p of search.data.products) {
        const q = (await call(tx, "quote_price", { cart: [{ productId: p.id, qty: 1 }] })) as any;
        expect(q.data.lines[0].lineTotal, p.id).toBe(p.currentPrice);
      }
    }));

  it("matches keywords across name, category and description", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "search_products", { query: "down sleeping bag" })) as any;
      expect(r.data.products[0].category).toBe("sleeping_bags");
      expect(r.data.products[0].specs.material).toMatch(/down/);
    }));

  it("filters sleeping bags by temperature rating", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "search_products", { filters: { category: "sleeping_bags", maxTempRatingC: -10 } })) as any;
      expect(r.data.products.map((p: any) => p.id).sort()).toEqual(["bag-ember-minus10", "bag-glacier-minus20"]);
    }));

  it("returns nothing (not a guess) for an unknown product", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "search_products", { query: "kayak" })) as any;
      expect(r.data.totalMatches).toBe(0);
    }));

  it("rejects a bad category", () =>
    inTx(async (tx) => {
      expect(await call(tx, "search_products", { filters: { category: "kayaks" } })).toMatchObject({ error: { code: "INVALID_ARGS" } });
    }));
});

describe("get_product", () => {
  it("returns the Ridge 2 specs, list price and today's sale price", () =>
    inTx(async (tx) => {
      const r = await call(tx, "get_product", { id: "tent-ridge-2" });
      expect(r).toMatchObject({
        ok: true,
        data: {
          name: "Ridge 2 Backpacking Tent",
          listPrice: "$249.00",
          currentPrice: "$199.20",
          activeDeals: ["Tent Sale: 20% off all tents"],
          specs: { waterproof: true, weightGrams: 1900, waterproofRatingMm: 3000 },
        },
      });
      expect((r as any).data).not.toHaveProperty("price");
    }));

  it("a product not on sale has currentPrice equal to listPrice", () =>
    inTx(async (tx) => {
      const r = await call(tx, "get_product", { id: "stove-quickboil" });
      expect(r).toMatchObject({ ok: true, data: { listPrice: "$129.00", currentPrice: "$129.00", activeDeals: [] } });
    }));

  it("get_product and search_products agree on both prices for every product", () =>
    inTx(async (tx) => {
      const search = (await call(tx, "search_products", { limit: 20 })) as any;
      const all = [];
      for (const category of ["tents", "sleeping_bags", "backpacks", "stoves", "headlamps", "jackets", "boots"]) {
        all.push(...((await call(tx, "search_products", { filters: { category }, limit: 20 })) as any).data.products);
      }
      expect(all).toHaveLength(60);
      expect(search.data.totalMatches).toBe(60);
      for (const p of all) {
        const g = (await call(tx, "get_product", { id: p.id })) as any;
        expect({ list: g.data.listPrice, current: g.data.currentPrice }, p.id).toEqual({ list: p.listPrice, current: p.currentPrice });
      }
    }));

  it("unknown id is an error, not an invented product", () =>
    inTx(async (tx) => {
      expect(await call(tx, "get_product", { id: "tent-ridge-9" })).toMatchObject({ ok: false, error: { code: "PRODUCT_NOT_FOUND" } });
    }));
});

describe("check_stock", () => {
  it("jacket in size M, green", () =>
    inTx(async (tx) => {
      const r = await call(tx, "check_stock", { productId: "jacket-squall", size: "m", color: "Green" });
      expect(r).toMatchObject({ ok: true, data: { variants: [{ size: "M", color: "green", inStock: true, unitsAvailable: 3, availability: "low_stock" }] } });
    }));

  it("out of stock variant", () =>
    inTx(async (tx) => {
      const r = await call(tx, "check_stock", { productId: "jacket-squall", size: "L", color: "green" });
      expect(r).toMatchObject({ data: { variants: [{ inStock: false, availability: "out_of_stock" }] } });
    }));

  it("a color that doesn't exist lists the real options", () =>
    inTx(async (tx) => {
      const r = await call(tx, "check_stock", { productId: "jacket-squall", color: "purple" });
      expect(r).toMatchObject({ ok: false, error: { code: "VARIANT_NOT_FOUND", details: { colors: ["green", "navy"] } } });
    }));

  it("without size/color, lists every variant", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "check_stock", { productId: "jacket-squall" })) as any;
      expect(r.data.variants).toHaveLength(10);
    }));
});

describe("get_active_promotions", () => {
  it("lists current deals and public codes, not expired or used ones", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "get_active_promotions", {})) as any;
      expect(r.data.promotions.map((p: any) => p.name)).toEqual(
        expect.arrayContaining(["Tent Sale: 20% off all tents", "Headlamps: buy 2, get 1 free"]),
      );
      expect(JSON.stringify(r.data.promotions)).not.toContain("Stove Sale");
      const codes = r.data.couponCodes.map((c: any) => c.code);
      expect(codes).toEqual(expect.arrayContaining(["SUMMER10", "TRAIL25", "GEAR20"]));
      expect(codes).not.toContain("SPRING15");
      expect(codes).not.toContain("WELCOME5");
      expect(codes.some((c: string) => c.startsWith("SORRY"))).toBe(false);
    }));
});

describe("validate_coupon", () => {
  const tents = [{ productId: "tent-ridge-2", qty: 1 }];

  it.each([
    ["SPRING15", tents, "EXPIRED"],
    ["WELCOME5", tents, "ALREADY_USED"],
    ["GEAR20", tents, "CATEGORY_EXCLUDED"],
    ["TRAIL25", [{ productId: "stove-pocket", qty: 1 }], "MIN_SPEND_NOT_MET"],
    ["FAKE50", tents, "NOT_FOUND"],
    ["SORRY-SA5K2", tents, "NOT_FOUND"], // Sofia's goodwill code, used by someone else
  ])("%s is rejected with %s", (code, cart, reason) =>
    inTx(async (tx) => {
      const r = await call(tx, "validate_coupon", { code, cart }, as(MAYA));
      expect(r).toMatchObject({ ok: true, policyDecision: "denied", data: { valid: false, reason } });
    }),
  );

  it("SUMMER10 is valid on tents", () =>
    inTx(async (tx) => {
      const r = await call(tx, "validate_coupon", { code: "summer10", cart: tents });
      expect(r).toMatchObject({ ok: true, policyDecision: "auto_approved", data: { valid: true, code: "SUMMER10" } });
    }));
});

describe("quote_price", () => {
  it("2 Ridge 2 tents with SUMMER10: sale, then coupon, free shipping", () =>
    inTx(async (tx) => {
      // 2 × $249.00 = $498.00; 20% tent sale −$99.60 = $398.40; 10% coupon −$39.84 = $358.56
      const r = await call(tx, "quote_price", { cart: [{ productId: "tent-ridge-2", qty: 2 }], coupon: "SUMMER10" });
      expect(r).toMatchObject({
        ok: true,
        data: {
          subtotal: "$498.00",
          lines: [{ listPrice: "$249.00", discounts: [{ deal: "Tent Sale: 20% off all tents", amount: "-$99.60" }], lineTotal: "$398.40" }],
          coupon: { code: "SUMMER10", applied: true, discount: "-$39.84" },
          shipping: "FREE",
          total: "$358.56",
          totalCents: 35856,
        },
      });
    }));

  it("3 headlamps: cheapest free, and shipping charged under $75", () =>
    inTx(async (tx) => {
      const r = await call(tx, "quote_price", {
        cart: [
          { productId: "lamp-beacon-500", qty: 1 },
          { productId: "lamp-glowworm-300", qty: 1 },
          { productId: "lamp-firefly-kids", qty: 1 },
        ],
      });
      // $49 + $29 + $14.99, Firefly free → $78.00 → free shipping
      expect(r).toMatchObject({ data: { total: "$78.00", shipping: "FREE", totalDiscounts: "-$14.99" } });
    }));

  it("an expired coupon is not applied, even if the customer insists", () =>
    inTx(async (tx) => {
      const r = await call(tx, "quote_price", { cart: [{ productId: "stove-quickboil", qty: 1 }], coupon: "SPRING15" });
      expect(r).toMatchObject({ policyDecision: "denied", data: { coupon: { applied: false, reason: "EXPIRED" }, total: "$129.00" } });
    }));

  it("duplicate lines are merged", () =>
    inTx(async (tx) => {
      const r = await call(tx, "quote_price", {
        cart: [
          { productId: "stove-fuel-230", qty: 2 },
          { productId: "stove-fuel-230", qty: 1 },
        ],
      });
      expect(r).toMatchObject({ data: { lines: [{ qty: 3 }], subtotal: "$20.97", shipping: "$7.99", total: "$28.96" } });
    }));

  it("rejects unknown products and silly quantities", () =>
    inTx(async (tx) => {
      expect(await call(tx, "quote_price", { cart: [{ productId: "nope", qty: 1 }] })).toMatchObject({ error: { code: "PRODUCT_NOT_FOUND" } });
      expect(await call(tx, "quote_price", { cart: [{ productId: "stove-pocket", qty: 0 }] })).toMatchObject({ error: { code: "INVALID_ARGS" } });
      expect(await call(tx, "quote_price", { cart: [{ productId: "stove-pocket", qty: 1.5 }] })).toMatchObject({ error: { code: "INVALID_ARGS" } });
      expect(await call(tx, "quote_price", { cart: [] })).toMatchObject({ error: { code: "INVALID_ARGS" } });
      expect(
        await call(tx, "quote_price", { cart: [{ productId: "stove-pocket", qty: 6 }, { productId: "stove-pocket", qty: 6 }] }),
      ).toMatchObject({ error: { code: "QTY_LIMIT" } });
    }));

  it("only one coupon per order: a list of codes is rejected", () =>
    inTx(async (tx) => {
      const r = await call(tx, "quote_price", { cart: [{ productId: "stove-pocket", qty: 1 }], coupon: ["SUMMER10", "GEAR20"] });
      expect(r).toMatchObject({ error: { code: "INVALID_ARGS" } });
    }));
});

describe("shared tools", () => {
  it("get_policy returns the price-match policy (no price matching)", () =>
    inTx(async (tx) => {
      const r = (await call(tx, "get_policy", { topic: "price_match" })) as any;
      expect(r.data.text).toMatch(/don't offer price matching/);
    }));

  it("policy text states the same limits the code enforces", () =>
    inTx(async (tx) => {
      const refunds = (await call(tx, "get_policy", { topic: "refunds" })) as any;
      const returns = (await call(tx, "get_policy", { topic: "returns" })) as any;
      expect(refunds.data.text).toContain("$50.00");
      expect(returns.data.text).toContain("30 days");
    }));

  it("reply rejects an empty message", () =>
    inTx(async (tx) => {
      expect(await call(tx, "reply", { message: "   " })).toMatchObject({ error: { code: "INVALID_ARGS" } });
      expect(await call(tx, "reply", { message: "Hi!" })).toMatchObject({ ok: true });
    }));
});

describe("price fields are consistent across tools", () => {
  /** Collects every key anywhere in a tool result. */
  const keysOf = (x: unknown, out = new Set<string>()): Set<string> => {
    if (Array.isArray(x)) x.forEach((v) => keysOf(v, out));
    else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) (out.add(k), keysOf(v, out));
    return out;
  };

  it("no tool shows a product price under an ambiguous name like price or unitPrice", () =>
    inTx(async (tx) => {
      const results = [
        await call(tx, "search_products", { query: "tent" }),
        await call(tx, "get_product", { id: "tent-ridge-2" }),
        await call(tx, "quote_price", { cart: [{ productId: "tent-ridge-2", qty: 1 }] }),
        await call(tx, "get_order", { orderId: 1042 }, as(MAYA)),
      ];
      for (const r of results) {
        expect(r.ok).toBe(true);
        const keys = keysOf(r);
        expect(keys.has("price"), JSON.stringify(r).slice(0, 80)).toBe(false);
        expect(keys.has("unitPrice"), JSON.stringify(r).slice(0, 80)).toBe(false);
        expect(keys.has("listPrice"), JSON.stringify(r).slice(0, 80)).toBe(true);
      }
    }));
});
