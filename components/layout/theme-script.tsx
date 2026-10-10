"use client";

import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * Sets the `dark` class before first paint. Rendered only on the server: the browser runs it while
 * parsing <head>, and on the client this returns null so React never creates a <script> element
 * (React 19 warns about that, and it would not run anyway). React skips the leftover server node
 * in <head> during hydration.
 */
export function ThemeScript() {
  if (typeof window !== "undefined") return null;
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
