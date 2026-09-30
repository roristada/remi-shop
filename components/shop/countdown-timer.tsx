"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Props = {
  /** ISO timestamp of the deadline. */
  endsAt: string;
  /** Server time at render, used to correct for a wrong browser clock. */
  serverNow: string;
  label: string;
  endedLabel: string;
  /** "sm" = compact chip for product cards. */
  size?: "md" | "sm";
};

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Display only. Deadlines (discount end, payment window) are enforced server-side; when the
 * countdown reaches zero the page refreshes so the server can re-evaluate.
 */
export function CountdownTimer({ endsAt, serverNow, label, endedLabel, size = "md" }: Props) {
  const sm = size === "sm";
  const t = useTranslations("shop.countdown");
  const router = useRouter();
  const end = new Date(endsAt).getTime();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const skew = new Date(serverNow).getTime() - Date.now();
    let refreshed = false;
    const tick = () => {
      const left = end - (Date.now() + skew);
      setRemaining(left);
      if (left < 0 && !refreshed) {
        refreshed = true;
        router.refresh();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [end, serverNow, router]);

  // Nothing before mount: avoids a server/client mismatch in the ticking value.
  if (remaining === null) return <div className={sm ? "h-7" : "h-9"} aria-hidden />;

  if (remaining < 0) {
    return <p className={cn("text-muted-foreground", sm ? "text-xs" : "text-sm")}>{endedLabel}</p>;
  }

  const { days, h, m, s } = split(remaining);
  return (
    <p
      className={cn(
        "inline-flex items-center rounded-full bg-accent",
        sm ? "min-h-7 max-w-full flex-wrap gap-x-1.5 px-2.5 py-1 text-xs" : "h-9 gap-2 px-3 text-sm",
      )}
    >
      <Clock className={cn("text-brand-strong", sm ? "size-3.5" : "size-4")} aria-hidden />
      <span>{label}</span>
      {/* Screen readers get the text once; the ticking value is not announced every second. */}
      <span className="font-semibold whitespace-nowrap tabular-nums" aria-live="off">
        {days > 0 && `${t("days", { count: days })} `}
        {pad(h)}:{pad(m)}:{pad(s)}
      </span>
    </p>
  );
}
