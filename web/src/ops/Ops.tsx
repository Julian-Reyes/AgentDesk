import { useEffect, useState, type FormEvent } from "react";
import { checkAdmin } from "../lib/api.ts";
import { SnapshotFooter } from "../lib/SnapshotFooter.tsx";
import { IS_STATIC, SITE_ROOT } from "../lib/static.ts";
import { AgentsPage } from "./AgentsPage.tsx";
import { ApprovalsPage } from "./ApprovalsPage.tsx";
import { ComparisonPage } from "./ComparisonPage.tsx";
import { OverviewPage } from "./OverviewPage.tsx";
import { parseRoute } from "./route.ts";
import { applyTheme, pickTheme, saveTheme, savedTheme, type Theme } from "./theme.ts";
import { EvalConversationPage, EvalRunPage, EvalRunsPage, LiveRunPage, LiveRunsPage } from "./RunsPages.tsx";

/**
 * The ops dashboard shell: hash routing (no router library) and the admin
 * token. Reading is public; actions need the token, which the server checks
 * on every request. The token is kept for this browser tab only.
 */
const TOKEN_KEY = "agentdesk-admin-token";

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

/**
 * Light / dark. Top right: at the end of the nav row on wider screens; pinned
 * to the header's corner on phones, where the nav sits under the title.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => pickTheme(savedTheme(), matchMedia("(prefers-color-scheme: dark)").matches));
  // Until a choice is saved, follow the device if it changes (e.g. at sunset).
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => {
      if (!savedTheme()) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => applyTheme(theme), [theme]);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        saveTheme(next);
        setTheme(next);
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="absolute top-4 right-4 rounded-md border border-stone-200 p-1.5 text-stone-600 hover:text-forest-700 focus-visible:outline-2 focus-visible:outline-forest-600 sm:static"
    >
      {theme === "dark" ? (
        // Sun: tap for light.
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="10" cy="10" r="3.5" />
          <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M4 16l1.4-1.4M14.6 5.4 16 4" />
        </svg>
      ) : (
        // Moon: tap for dark.
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z" />
        </svg>
      )}
    </button>
  );
}

export function Ops() {
  const hash = useHash();
  const [token, setToken] = useState<string | null>(storedToken);
  const route = parseRoute(hash);
  const page = route.page;
  // Which nav item is current: the Runs pages all count as "runs".
  const section = page === "run" || page === "evals" || page === "evalRun" || page === "evalConversation" ? "runs" : page;
  // The comparison table and the overview's grids are wide; the other pages read better narrower.
  const width = page === "comparison" ? "max-w-7xl" : page === "overview" ? "max-w-6xl" : "max-w-5xl";

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
        <div className={`relative mx-auto flex ${width} flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="pr-10 sm:pr-0">
            <p className="text-lg font-semibold text-forest-800">AgentDesk ops</p>
            <p className="text-xs text-stone-500">Larchgrove Supply Co. demo · all customers and orders are fictional</p>
          </div>
          <div className="flex items-center gap-4">
            <nav aria-label="Dashboard" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {(
                [
                  ["overview", "Overview"],
                  ["approvals", "Approvals"],
                  ["agents", "Agents"],
                  // Phones get the short label so the nav fits on one line.
                  [
                    "comparison",
                    <>
                      <span className="md:hidden">Comparison</span>
                      <span className="hidden md:inline">Model comparison</span>
                    </>,
                  ],
                  ["runs", "Runs"],
                ] as const
              ).map(([p, label]) => (
                <a key={p} href={p === "overview" ? "#/" : `#/${p}`} aria-current={section === p ? "page" : undefined} className={section === p ? "font-semibold text-forest-800" : "text-stone-600 hover:text-forest-700"}>
                  {label}
                </a>
              ))}
              <a href={SITE_ROOT} className="text-stone-600 hover:text-forest-700">
                Storefront
              </a>
            </nav>
            <ThemeToggle />
          </div>
        </div>
        {!IS_STATIC && <AdminToken token={token} onChange={saveToken} width={width} />}
      </header>
      <main className={`mx-auto px-4 py-6 ${width}`}>
        {route.page === "run" ? (
          <LiveRunPage id={route.id} token={token} />
        ) : route.page === "runs" && !IS_STATIC ? (
          <LiveRunsPage token={token} />
        ) : route.page === "runs" ? (
          <EvalRunsPage />
        ) : route.page === "evals" ? (
          <EvalRunsPage />
        ) : route.page === "evalRun" ? (
          <EvalRunPage run={route.run} />
        ) : route.page === "evalConversation" ? (
          <EvalConversationPage run={route.run} model={route.model} caseId={route.caseId} />
        ) : page === "comparison" ? (
          <ComparisonPage />
        ) : page === "agents" ? (
          <AgentsPage token={token} />
        ) : page === "approvals" ? (
          <ApprovalsPage token={token} />
        ) : (
          <OverviewPage />
        )}
      </main>
      <SnapshotFooter />
    </div>
  );
}

function AdminToken({ token, onChange, width }: { token: string | null; onChange: (t: string | null) => void; width: string }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) {
    return (
      <div className={`mx-auto flex ${width} items-center gap-3 px-4 pb-3 text-xs text-stone-600`}>
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
    <form onSubmit={submit} className={`mx-auto flex ${width} flex-wrap items-center gap-2 px-4 pb-3 text-xs`}>
      <label htmlFor="admin-token" className="w-full text-stone-600 sm:w-auto">
        Read-only. For changes (approvals, agents) and live conversations, paste the admin token:
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
