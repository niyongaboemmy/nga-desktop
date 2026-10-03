// Light / dark for the shell. Default: whatever NGA MIS uses (its own toggle,
// saved per user in MIS as preferred_theme), so the desktop and MIS look alike.
export type ThemePref = "mis" | "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const resolveTheme = (pref: ThemePref, mis: Theme | undefined, systemDark: boolean): Theme => {
  if (pref === "light" || pref === "dark") return pref;
  if (pref === "mis" && mis) return mis;
  return systemDark ? "dark" : "light";
};

export const systemPrefersDark = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  // Animate colours for this one change only (not on first paint).
  if (root.dataset.theme) {
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), 400);
  }
  root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* first paint will just start light */
  }
};

const THEME_KEY = "nga.theme";

/** Before React renders: last theme, so the window doesn't flash light-then-dark. */
export const restoreTheme = () => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch {
    /* ignore */
  }
};
