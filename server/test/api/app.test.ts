import { describe, expect, it } from "vitest";
import { requireAdmin } from "../../src/api/admin.ts";
import type { AppDeps } from "../../src/api/app.ts";
import type { Tx } from "../../src/db/client.ts";
import { call, inTx } from "../helpers.ts";
import { TOKEN, json, testApp } from "./helpers.ts";

const appFor = (tx: Tx, over: Partial<AppDeps> = {}) => testApp(tx, { over }).app;

describe("API basics", () => {
  it("health check", () =>
    inTx(async (tx) => {
      const res = await appFor(tx).request("/api/health");
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ ok: true, data: { status: "up" } });
    }));

  it("unknown routes get the standard error shape", () =>
    inTx(async (tx) => {
      const res = await appFor(tx).request("/api/nope");
      expect(res.status).toBe(404);
      expect(await json(res)).toEqual({ ok: false, error: { code: "NOT_FOUND", message: "No route GET /api/nope." } });
    }));
});

describe("GET /api/products", () => {
  it("lists all 60 products with the same prices get_product gives the agents", () =>
    inTx(async (tx) => {
      const res = await appFor(tx).request("/api/products");
      expect(res.status).toBe(200);
      const { data } = await json(res);
      expect(data.products).toHaveLength(60);
      for (const p of data.products) {
        const tool = (await call(tx, "get_product", { id: p.id })) as any;
        expect({ listPrice: p.listPrice, currentPrice: p.currentPrice, availability: p.availability }, p.id).toEqual({
          listPrice: tool.data.listPrice,
          currentPrice: tool.data.currentPrice,
          availability: tool.data.availability,
        });
        expect(p.onSale, p.id).toBe(p.listPrice !== p.currentPrice);
      }
    }));

  it("shows the tent sale on the Ridge 2 and no sale on a headlamp", () =>
    inTx(async (tx) => {
      const { data } = await json(await appFor(tx).request("/api/products"));
      const byId = new Map(data.products.map((p: any) => [p.id, p]));
      expect(byId.get("tent-ridge-2")).toMatchObject({ listPrice: "$249.00", currentPrice: "$199.20", onSale: true });
      expect(byId.get("lamp-glowworm-300")).toMatchObject({ listPrice: "$29.00", currentPrice: "$29.00", onSale: false });
    }));

  it("filters by category, grouped in catalog order", () =>
    inTx(async (tx) => {
      const { data } = await json(await appFor(tx).request("/api/products?category=tents"));
      expect(data.products.length).toBeGreaterThan(0);
      expect(data.products.every((p: any) => p.category === "tents")).toBe(true);
      const names = data.products.map((p: any) => p.name);
      expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
      expect(data.categories[0]).toBe("tents");
    }));

  it("rejects an unknown category", () =>
    inTx(async (tx) => {
      const res = await appFor(tx).request("/api/products?category=kayaks");
      expect(res.status).toBe(400);
      expect((await json(res)).error.code).toBe("INVALID_QUERY");
    }));
});

describe("admin guard", () => {
  const check = (app: ReturnType<typeof appFor>, auth?: string) =>
    app.request("/api/admin/check", auth ? { headers: { authorization: auth } } : {});

  it("lets the right token through", () =>
    inTx(async (tx) => {
      const res = await check(appFor(tx), `Bearer ${TOKEN}`);
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ ok: true, data: { admin: true } });
    }));

  it("refuses a missing, wrong or malformed token", () =>
    inTx(async (tx) => {
      const app = appFor(tx);
      for (const auth of [undefined, `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(1)}`, TOKEN, `Basic ${TOKEN}`, "Bearer "]) {
        const res = await check(app, auth);
        expect(res.status, String(auth)).toBe(401);
        expect((await json(res)).error.code).toBe("ADMIN_REQUIRED");
      }
    }));

  it("with no token configured, actions are disabled rather than open", () =>
    inTx(async (tx) => {
      for (const adminToken of [undefined, ""]) {
        const res = await check(appFor(tx, { adminToken }), `Bearer ${TOKEN}`);
        expect(res.status).toBe(403);
        expect((await json(res)).error.code).toBe("ADMIN_DISABLED");
      }
    }));

  it("guards every /api/admin/* path, including ones that don't exist", () =>
    inTx(async (tx) => {
      const res = await appFor(tx).request("/api/admin/approvals/1/approve", { method: "POST" });
      expect(res.status).toBe(401);
    }));

  it("refuses a short token at startup", () => {
    expect(() => requireAdmin("short")).toThrow(/at least 24 characters/);
  });
});

describe("server errors", () => {
  it("hide the details from the client and log them", async () => {
    // A database that fails on every query.
    const broken = new Proxy({}, { get: () => () => { throw new Error("connection to db lost: secret detail"); } }) as unknown as Tx;
    const { app, errors: logged } = testApp(broken);
    const res = await app.request("/api/products");
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body).toEqual({ ok: false, error: { code: "INTERNAL", message: "Something went wrong on our side." } });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(logged[0]?.message).toContain("secret detail");
  });
});
