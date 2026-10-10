"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Megaphone, X } from "lucide-react";
import { Link } from "@/i18n/navigation";

const DISMISS_KEY = "remii-announcement-dismissed";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null; // Storage blocked: the bar simply stays.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * Slim store notice at the top of the home page (maintenance, outages, store-wide news), set in
 * admin › แบนเนอร์และประกาศ. A visitor can close it; it comes back when the text changes.
 * The dismissal lives in localStorage only — a convenience, never anything that matters.
 */
export function AnnouncementBar({ text, href, external }: { text: string; href: string | null; external: boolean }) {
  const t = useTranslations("home.announcementBar");
  // Rendered on the server; hidden after hydration only if this exact text was dismissed.
  const dismissedText = useSyncExternalStore(subscribe, readDismissed, () => null);
  const [closed, setClosed] = useState(false);

  if (closed || dismissedText === text) return null;

  const body = (
    <>
      <Megaphone className="size-4 shrink-0 text-brand-strong" aria-hidden />
      <span className="min-w-0 text-pretty">{text}</span>
      {href && <ArrowRight className="size-3.5 shrink-0" aria-hidden />}
    </>
  );
  const linkClass = "inline-flex min-w-0 items-center gap-2 underline-offset-4 hover:underline focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <aside aria-label={t("label")} className="border-b bg-accent/70 text-accent-foreground">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm">
        <div className="flex min-w-0 flex-1 justify-center">
          {href ? (
            external ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {body}
              </a>
            ) : (
              <Link href={href} className={linkClass}>
                {body}
              </Link>
            )
          ) : (
            <p className="inline-flex min-w-0 items-center gap-2">{body}</p>
          )}
        </div>
        <button
          type="button"
          aria-label={t("dismiss")}
          onClick={() => {
            setClosed(true);
            try {
              localStorage.setItem(DISMISS_KEY, text);
            } catch {
              // Ignore: closing still works for this visit.
            }
          }}
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
