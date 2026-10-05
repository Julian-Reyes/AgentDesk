import { staticPath } from "./static-path.ts";

/**
 * The public site's static mode (M5, Julian 2026-10-05): a read-only snapshot
 * on GitHub Pages, with no API and no database. Built with VITE_STATIC=1;
 * every GET reads the exported JSON instead of the API (see static-path.ts),
 * and anything that would change data is refused. The real app, with admin
 * features and live chat, runs only on Julian's machine.
 */
export const IS_STATIC = import.meta.env.VITE_STATIC === "1";

/** The site's root ("/" locally, "/AgentDesk/" on Pages), for links between the storefront and the dashboard. */
export const SITE_ROOT = import.meta.env.BASE_URL;

/** Where a GET's exported response lives on the static site. */
export const snapshotUrl = (apiPath: string) => `${SITE_ROOT}data/${staticPath(apiPath).split("/").map(encodeURIComponent).join("/")}`;

export const READ_ONLY_MESSAGE = "This is a read-only snapshot. The live app runs on the author's machine.";

/** "Data as of 2026-10-05, commit abc1234", from the export's meta.json. */
export type SnapshotMeta = { exportedAt: string; commit: string; repoUrl: string | null };
