"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Asks the browser to confirm leaving the page while there are unsaved changes. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/**
 * Ctrl+S / ⌘S runs `onSave` while `enabled`. `scope` limits it to a visible element, so
 * mounted-but-hidden tabs do not react.
 */
export function useSaveShortcut(onSave: () => void, enabled: boolean, scope?: RefObject<HTMLElement | null>) {
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      const el = scope?.current;
      if (scope && (!el || (el.checkVisibility ? !el.checkVisibility() : el.offsetParent === null))) return;
      e.preventDefault();
      saveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, scope]);
}
