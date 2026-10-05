import { useEffect, useState } from "react";
import { getSnapshotMeta } from "./api.ts";
import { IS_STATIC, type SnapshotMeta } from "./static.ts";

/** Static site only: when the data was exported, and from which commit. */
export function SnapshotFooter() {
  const [meta, setMeta] = useState<SnapshotMeta | null>(null);
  useEffect(() => {
    if (IS_STATIC) void getSnapshotMeta().then(setMeta);
  }, []);
  if (!IS_STATIC) return null;
  return (
    <footer className="border-t border-stone-200 bg-white px-4 py-4 text-center text-xs text-stone-500">
      {meta ? (
        <>
          Data as of {meta.exportedAt}, commit{" "}
          {meta.repoUrl ? (
            <a className="underline" href={`${meta.repoUrl}/commit/${meta.commit}`}>
              {meta.commit}
            </a>
          ) : (
            meta.commit
          )}
          .{" "}
        </>
      ) : null}
      A read-only snapshot: the agents, the evals and every admin action run on the author's machine.
      {meta?.repoUrl && (
        <>
          {" "}
          <a className="underline" href={meta.repoUrl}>
            Source on GitHub
          </a>
          .
        </>
      )}
    </footer>
  );
}
