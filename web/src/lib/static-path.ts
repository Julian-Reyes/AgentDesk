/**
 * Where an API response lives in the public site's snapshot (M5, Julian
 * 2026-10-05: a static, read-only copy on GitHub Pages). The export script
 * (server/src/static/export.ts) writes each GET response to this path, and
 * the static build reads it from there, so both sides use this one function.
 *
 *   /api/overview                                   → api/overview.json
 *   /api/approvals?status=pending                   → api/approvals/status~pending.json
 *   /api/eval-runs/test-1/conversation?model=groq/gpt-oss-120b&case=x
 *                                                   → api/eval-runs/test-1/conversation/case~x/model~groq__gpt-oss-120b.json
 *
 * Path segments are decoded and query parameters sorted, so the same request
 * always maps to the same file. "/" inside a value becomes "__" (model ids
 * have one), the same spelling the eval runs use for their folders. Query
 * parameters are written key~value: "~" is never percent-encoded in a URL,
 * while "=" would be sent as %3D, which static hosts don't all map back.
 */
export function staticPath(apiPath: string): string {
  const url = new URL(apiPath, "http://snapshot.invalid");
  if (!url.pathname.startsWith("/api/")) throw new Error(`Not an API path: ${apiPath}`);
  const segment = (s: string) => {
    const clean = s.replaceAll("/", "__");
    if (clean === "" || clean === "." || clean === ".." || /[\\\0]/.test(clean)) throw new Error(`Unsafe path segment in ${apiPath}`);
    return clean;
  };
  const parts = url.pathname
    .slice(1)
    .split("/")
    .filter(Boolean)
    .map((p) => segment(decodeURIComponent(p)));
  const query = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => segment(`${k}~${v}`));
  return `${[...parts, ...query].join("/")}.json`;
}
