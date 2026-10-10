"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Megaphone, X } from "lucide-react";
import { Link } from "@/i18n/navigation";

const DISMISS_KEY = "remii-announcement-dismissed";
/** Ticker speed, so a long notice doesn't race and a short one doesn't crawl on wide screens. */
const SCROLL_PX_PER_SECOND = 60;

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
export function AnnouncementBar({
  text,
  href,
  external,
  scroll = false,
}: {
  text: string;
  href: string | null;
  external: boolean;
  /** Run the text as a ticker (pauses on hover/focus; still under reduced motion). */
  scroll?: boolean;
}) {
  const t = useTranslations("home.announcementBar");
  const trackRef = useRef<HTMLSpanElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  // One loop moves the track by one copy; time it from the copy's real width.
  useEffect(() => {
    const track = trackRef.current;
    if (!scroll || !track) return;
    const measure = () => setDuration(Math.max(8, track.scrollWidth / 2 / SCROLL_PX_PER_SECOND));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [scroll, text]);
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
  // Ticker: two copies side by side, each at least as wide as the bar, slid by one copy per loop.
  const content = scroll ? (
    <span className="announcement-marquee block min-w-0 flex-1 overflow-hidden">
      <span
        ref={trackRef}
        className="announcement-marquee-track"
        style={duration ? ({ "--marquee-duration": `${duration}s` } as CSSProperties) : undefined}
      >
        <span className="announcement-marquee-copy">{body}</span>
        <span className="announcement-marquee-copy" aria-hidden>
          {body}
        </span>
      </span>
    </span>
  ) : (
    body
  );
  const linkClass = "inline-flex min-w-0 items-center gap-2 underline-offset-4 hover:underline focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <aside aria-label={t("label")} className="border-b bg-accent/70 text-accent-foreground">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-sm">
        <div className={scroll ? "flex min-w-0 flex-1 [&>*]:flex-1" : "flex min-w-0 flex-1 justify-center"}>
          {href ? (
            external ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {content}
              </a>
            ) : (
              <Link href={href} className={linkClass}>
                {content}
              </Link>
            )
          ) : (
            <p className="inline-flex min-w-0 items-center gap-2">{content}</p>
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
