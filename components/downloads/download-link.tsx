"use client";

import { useEffect, useRef, useState } from "react";
import { Download as DownloadIcon, Loader2 } from "lucide-react";

// The route answers with a redirect to the file, so the page never unloads: reset after a while.
const PENDING_MS = 6_000;

/**
 * Download button that shows it is working while the server checks access and signs the link,
 * and ignores repeat clicks meanwhile. The link itself is a plain GET; all checks are server-side.
 */
export function DownloadLink({ href, label, pendingLabel }: { href: string; label: string; pendingLabel: string }) {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <a
      href={href}
      aria-disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (pending) {
          e.preventDefault();
          return;
        }
        setPending(true);
        timer.current = setTimeout(() => setPending(false), PENDING_MS);
      }}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80 aria-disabled:cursor-wait aria-disabled:opacity-80"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <DownloadIcon className="size-3.5" aria-hidden />
      )}
      <span aria-live="polite">{pending ? pendingLabel : label}</span>
    </a>
  );
}
