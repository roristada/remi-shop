"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "cn";

/**
 * Floating bar pinned to the bottom of the viewport while its container is on screen,
 * so Save is reachable without scrolling. Render it as the last child of the form/section.
 */
export function SaveBar({
  dirty,
  message = "มีการแก้ไขที่ยังไม่บันทึก",
  idleMessage,
  children,
}: {
  dirty: boolean;
  message?: ReactNode;
  /** Shown when there is nothing to save; omit to hide the bar until something changes. */
  idleMessage?: ReactNode;
  children: ReactNode;
}) {
  if (!dirty && idleMessage === undefined) return null;
  return (
    <div
      role="status"
      className={cn(
        "sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background/95 p-3 pl-4 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2",
        dirty && "border-warning/40",
      )}
    >
      <p className={cn("flex items-center gap-2 text-sm", dirty ? "font-medium text-warning" : "text-muted-foreground")}>
        {dirty && <span className="size-2 shrink-0 rounded-full bg-warning" aria-hidden />}
        {dirty ? message : idleMessage}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

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
