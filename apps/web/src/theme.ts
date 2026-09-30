export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "maxio-hub-theme";

export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "dark" || stored === "light") return stored;
  return prefersDark ? "dark" : "light";
}
export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}
