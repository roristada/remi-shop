"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

type Props = {
  /** ISO timestamp when the discount ends (inclusive). */
  endsAt: string;
  /** Server time at render, used to correct for a wrong browser clock. */
  serverNow: string;
};

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Display only. Whether the discount applies is decided server-side; when the countdown
 * reaches zero the page refreshes so the server can recalculate the price.
 */
export function CountdownTimer({ endsAt, serverNow }: Props) {
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
  if (remaining === null) return <div className="h-9" aria-hidden />;

  if (remaining < 0) {
    return <p className="text-sm text-muted-foreground">{t("ended")}</p>;
  }

  const { days, h, m, s } = split(remaining);
  return (
    <p className="inline-flex h-9 items-center gap-2 rounded-full bg-accent px-3 text-sm">
      <Clock className="size-4 text-brand-strong" aria-hidden />
      <span>{t("endsIn")}</span>
      {/* Screen readers get the text once; the ticking value is not announced every second. */}
      <span className="font-semibold tabular-nums" aria-live="off">
        {days > 0 && `${t("days", { count: days })} `}
        {pad(h)}:{pad(m)}:{pad(s)}
      </span>
    </p>
  );
}
