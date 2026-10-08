// Storefront light/dark theme. The choice lives in this browser only (localStorage); without one
// the system setting decides. Admin has its own root layout and never runs this.

export const THEME_STORAGE_KEY = "theme";
export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/**
 * Runs in <head> before first paint, so a dark-theme visitor never sees a white flash. Kept
 * tiny and self-contained (it is inlined as a string).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
