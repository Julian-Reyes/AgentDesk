/**
 * The dashboard's hash routes (no router library). Model ids contain "/", so
 * they're URI-encoded inside the hash.
 *   #/ (the overview, also for anything unknown)  #/approvals  #/agents  #/comparison
 *   #/runs               live runs        #/runs/<id>                 one live trace
 *   #/evals              saved eval runs  #/evals/<run>               its conversations
 *   #/evals/<run>/<model>/<case>         one eval conversation
 */
export type Route =
  | { page: "overview" | "approvals" | "agents" | "comparison" | "runs" | "evals" }
  | { page: "run"; id: string }
  | { page: "evalRun"; run: string }
  | { page: "evalConversation"; run: string; model: string; caseId: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const dec = (p: string) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  };
  const [head, a, b, c] = parts;
  if (head === "runs" && a && parts.length === 2) return { page: "run", id: dec(a) };
  if (head === "evals" && a && parts.length === 2) return { page: "evalRun", run: dec(a) };
  if (head === "evals" && a && b && c && parts.length === 4) return { page: "evalConversation", run: dec(a), model: dec(b), caseId: dec(c) };
  if (parts.length === 1 && (["approvals", "agents", "comparison", "runs", "evals"] as const).includes(head as never)) return { page: head as "approvals" | "agents" | "comparison" | "runs" | "evals" };
  return { page: "overview" };
}

export const href = {
  run: (id: string) => `#/runs/${encodeURIComponent(id)}`,
  evalRun: (run: string) => `#/evals/${encodeURIComponent(run)}`,
  evalConversation: (run: string, model: string, caseId: string) => `#/evals/${encodeURIComponent(run)}/${encodeURIComponent(model)}/${encodeURIComponent(caseId)}`,
};
