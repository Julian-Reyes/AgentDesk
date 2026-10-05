import { useEffect, useMemo, useState } from "react";
import { getProducts, type Product } from "../lib/api.ts";
import { ChatWidget } from "./ChatWidget.tsx";
import { AVAILABILITY, categoryLabel, percentOff } from "./format.ts";

export function Storefront() {
  const [data, setData] = useState<{ categories: string[]; products: Product[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    getProducts().then(setData, (e: Error) => setError(e.message));
  }, []);

  const shown = useMemo(() => (data ? data.products.filter((p) => !category || p.category === category) : []), [data, category]);

  return (
    <div className="min-h-screen">
      <div className="bg-forest-900 px-4 py-2 text-center text-xs text-forest-100">
        Demo store: every product, customer and order here is fictional. The chat is answered live by AI agents.
      </div>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-forest-800">Larchgrove Supply Co.</p>
            <p className="text-sm text-stone-600">Tents, packs and layers for the trail. Ships from Reno, NV.</p>
          </div>
          <div className="flex flex-col gap-1 text-sm sm:items-end">
            <p className="text-stone-600">Questions about gear or an order? Use the chat, bottom right.</p>
            <a href="/ops/" className="font-medium text-forest-700 underline-offset-2 hover:underline">
              Ops dashboard: see how the agents work →
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {data && (
          <nav aria-label="Categories" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
            {[null, ...data.categories].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  category === c ? "border-forest-700 bg-forest-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-forest-600"
                }`}
              >
                {c ? categoryLabel(c) : "All gear"}
              </button>
            ))}
          </nav>
        )}

        {error && <p className="rounded-md bg-rust-50 p-4 text-rust-600">{error}</p>}
        {!data && !error && <p className="text-stone-500">Loading the catalog…</p>}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </ul>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-24 pt-4 text-xs text-stone-500">
        Larchgrove Supply Co. is fictional, part of AgentDesk, a portfolio project on building and measuring AI agents.
      </footer>
      <ChatWidget />
    </div>
  );
}

function ProductCard({ product: p }: { product: Product }) {
  const avail = AVAILABILITY[p.availability];
  const off = p.onSale ? percentOff(p.listPrice, p.currentPrice) : null;
  return (
    <li className="flex flex-col rounded-lg border border-stone-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-stone-500">
        <span>{categoryLabel(p.category)}</span>
        <span aria-label={`Rated ${p.rating} out of 5`}>★ {p.rating.toFixed(1)}</span>
      </div>
      <h2 className="font-medium text-stone-900">{p.name}</h2>
      <p className="mt-1 flex-1 text-sm text-stone-600">{p.description}</p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p>
          <span className={`text-lg font-semibold ${p.onSale ? "text-rust-600" : "text-stone-900"}`}>{p.currentPrice}</span>
          {p.onSale && (
            <>
              {" "}
              <s className="text-sm text-stone-500">{p.listPrice}</s>
              {off !== null && <span className="ml-2 rounded bg-rust-50 px-1.5 py-0.5 text-xs font-medium text-rust-600">{off}% off</span>}
            </>
          )}
        </p>
        <span className={`text-xs ${avail.tone === "out" ? "text-stone-500" : avail.tone === "low" ? "text-rust-600" : "text-forest-700"}`}>{avail.label}</span>
      </div>
    </li>
  );
}
