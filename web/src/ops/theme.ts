/**
 * Light or dark for the ops dashboard. With no choice saved, it follows the
 * device; the toggle saves an explicit choice. ops/index.html repeats
 * `pickTheme` inline so the right theme is set before the first paint (no
 * white flash in dark mode); keep the two in step.
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "agentdesk-theme";

/** A saved choice wins; anything else (nothing saved, junk) follows the device. */
export const pickTheme = (saved: string | null, deviceDark: boolean): Theme => (saved === "light" || saved === "dark" ? saved : deviceDark ? "dark" : "light");

export function savedTheme(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
}
