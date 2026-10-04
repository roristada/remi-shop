"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, Clock } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { BUSINESS_TIMEZONE, deadlineDisplay } from "@/lib/datetime";
import { cn } from "@/lib/utils";

/** opens = sale starts, saleEnds = limited-time product ends, discountEnds = promotion ends. */
export type DeadlineKind = "opens" | "saleEnds" | "discountEnds";

type Props = {
  kind: DeadlineKind;
  /** ISO timestamp of the deadline. */
  at: string;
  /** Server time at render, used to correct for a wrong browser clock. */
  serverNow: string;
  /** "sm" = compact chip for product cards. */
  size?: "md" | "sm";
};

const pad = (n: number) => String(n).padStart(2, "0");

function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * One deadline, shown the same way everywhere: "เปิดขาย 4 ต.ค. 2026 เวลา 00:00" until that
 * Bangkok day, then "เปิดขายใน 20:06:17" ticking down. Display only — when it reaches zero the
 * page refreshes and the server decides the real price and state.
 */
export function DeadlineNotice({ kind, at, serverNow, size = "md" }: Props) {
  const t = useTranslations("shop.deadline");
  const dateLocale = intlLocale(useLocale()).date;
  const router = useRouter();
  const end = new Date(at).getTime();
  // null until mounted: the server renders the date form, which needs no clock.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const skew = new Date(serverNow).getTime() - Date.now();
    // Refresh only when the deadline passes while mounted. Already past on mount means the
    // server rendered it that way; refreshing would bring a new serverNow and loop forever.
    let refreshed = Date.now() + skew >= end;
    const tick = () => {
      const current = Date.now() + skew;
      setNow(current);
      if (current >= end && !refreshed) {
        refreshed = true;
        router.refresh();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [end, serverNow, router]);

  const mode = now === null ? "date" : deadlineDisplay(new Date(end), new Date(now));
  if (mode === "passed") return null;

  const sm = size === "sm";
  const date = new Intl.DateTimeFormat(dateLocale, { timeZone: BUSINESS_TIMEZONE, dateStyle: "medium" }).format(end);
  const time = new Intl.DateTimeFormat(dateLocale, { timeZone: BUSINESS_TIMEZONE, timeStyle: "short" }).format(end);
  const Icon = mode === "countdown" ? Clock : CalendarClock;

  return (
    <p
      className={cn(
        "inline-flex max-w-full items-center rounded-full",
        mode === "countdown" ? "bg-accent" : "bg-secondary",
        sm ? "min-h-7 flex-wrap gap-x-1.5 px-2.5 py-1 text-xs" : "min-h-9 gap-2 px-3 py-1.5 text-sm",
      )}
    >
      <Icon className={cn("shrink-0 text-brand-strong", sm ? "size-3.5" : "size-4")} aria-hidden />
      {mode === "countdown" && now !== null ? (
        <>
          <span>{t(`${kind}.in`)}</span>
          {/* Screen readers get the label once; the ticking value is not announced every second. */}
          <span className="font-semibold whitespace-nowrap tabular-nums" aria-live="off">
            {hms(end - now)}
          </span>
        </>
      ) : (
        <span>{t(`${kind}.at`, { date, time })}</span>
      )}
    </p>
  );
}
