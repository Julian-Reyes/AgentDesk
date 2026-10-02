import { useEffect, useState, type FormEvent } from "react";
import { checkAdmin } from "../lib/api.ts";
import { ApprovalsPage } from "./ApprovalsPage.tsx";

/**
 * The ops dashboard shell: hash routing (no router library) and the admin
 * token. Reading is public; actions need the token, which the server checks
 * on every request. The token is kept for this browser tab only.
 */
const TOKEN_KEY = "switchyard-admin-token";

function storedToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function useHash() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export function Ops() {
  const hash = useHash();
  const [token, setToken] = useState<string | null>(storedToken);
  const run = /^#\/runs\/([\w-]+)$/.exec(hash)?.[1];

  const saveToken = (t: string | null) => {
    setToken(t);
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // storage blocked: the token lasts until the page reloads
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-forest-800">Switchyard ops</p>
            <p className="text-xs text-stone-500">Larchgrove Supply Co. demo · all customers and orders are fictional</p>
          </div>
          <nav aria-label="Dashboard" className="flex gap-3 text-sm">
            <a href="#/approvals" aria-current={!run ? "page" : undefined} className={!run ? "font-semibold text-forest-800" : "text-stone-600 hover:text-forest-700"}>
              Approvals
            </a>
          </nav>
        </div>
        <AdminToken token={token} onChange={saveToken} />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {run ? (
          <section className="rounded-md border border-stone-200 bg-white p-4 text-sm">
            <h1 className="mb-2 font-semibold">Conversation {run.slice(0, 8)}</h1>
            <p className="text-stone-600">
              The trace viewer comes with the Runs page (M4 step 7). Until then, print it with <code className="rounded bg-stone-100 px-1">npm run trace -- {run}</code>
            </p>
            <a href="#/approvals" className="mt-3 inline-block text-forest-700 underline">
              Back to approvals
            </a>
          </section>
        ) : (
          <ApprovalsPage token={token} />
        )}
      </main>
    </div>
  );
}

function AdminToken({ token, onChange }: { token: string | null; onChange: (t: string | null) => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) {
    return (
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pb-3 text-xs text-stone-600">
        <span className="rounded-full bg-forest-50 px-2 py-0.5 text-forest-800">Admin actions on</span>
        <button type="button" className="underline" onClick={() => onChange(null)}>
          Forget token
        </button>
      </div>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await checkAdmin(draft.trim());
      onChange(draft.trim());
      setDraft("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 pb-3 text-xs">
      <label htmlFor="admin-token" className="w-full text-stone-600 sm:w-auto">
        Read-only. To approve or reject, paste the admin token:
      </label>
      <input
        id="admin-token"
        type="password"
        autoComplete="off"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 sm:max-w-xs"
      />
      <button type="submit" disabled={busy || !draft.trim()} className="rounded bg-forest-700 px-3 py-1 text-white disabled:opacity-50">
        {busy ? "Checking…" : "Use token"}
      </button>
      {error && (
        <p role="alert" className="w-full text-rust-600">
          {error}
        </p>
      )}
    </form>
  );
}
