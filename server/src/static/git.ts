/** Small git helpers for the static export, kept pure so they're tested without a repo. */

/** Changed paths from `git status --porcelain`, ignoring the export's own output folder. */
export function dirtyFiles(porcelain: string): string[] {
  return porcelain
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.slice(3))
    .filter((path) => !path.startsWith("site-data/") && path !== "site-data");
}

/** "git@github.com:a/b.git" or "https://github.com/a/b.git" → "https://github.com/a/b"; null for anything else. */
export function githubUrl(remote: string): string | null {
  const m = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote.trim());
  return m ? `https://github.com/${m[1]}` : null;
}
