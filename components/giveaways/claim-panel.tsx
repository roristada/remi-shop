"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleCheck, Gift, ImageOff, Loader2, PartyPopper, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { PreviewImage } from "@/components/shared/preview-image";
import { CountdownTimer } from "@/components/shop/countdown-timer";
import { claimPrize } from "@/lib/giveaways/actions";
import type { SubstituteOption } from "@/lib/giveaways/queries";
import type { PrizeBlock } from "@/lib/giveaways/service";
import type { WinnerState } from "@/lib/giveaways/rules";
import { formatTHB } from "@/lib/pricing/calculate";

type Props = {
  winnerId: string;
  state: WinnerState;
  block: PrizeBlock;
  /** Satang. */
  prizeValue: number;
  claimDeadline: string;
  serverNow: string;
  orderNumber: string | null;
  prize: { name: string; variantName: string | null; imageUrl: string | null } | null;
  substitutes: SubstituteOption[];
};

/** The winner's own card: claim the prize, or pick a substitute when the prize cannot be delivered. */
export function ClaimPanel({ winnerId, state, block, prizeValue, claimDeadline, serverNow, orderNumber, prize, substitutes }: Props) {
  const t = useTranslations("giveaways");
  const locale = useLocale();
  const money = (satang: number) => formatTHB(satang, intlLocale(locale).number);
  const [pending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  useWinConfetti(state === "PENDING" ? winnerId : null);

  const claim = (substitute: { productId: string; variantId: string | null } | null, key: string) => {
    setPendingKey(key);
    startTransition(async () => {
      const result = await claimPrize(winnerId, substitute, locale);
      // Success redirects; only failures come back.
      if (result && !result.ok) toast.error(t(`claimErrors.${result.code}`));
      setPendingKey(null);
    });
  };

  return (
    <section
      aria-labelledby="won-title"
      className="space-y-4 rounded-3xl border-2 border-primary bg-primary/10 p-5 duration-500 animate-in fade-in zoom-in-95 motion-reduce:animate-none sm:p-6"
    >
      <h2 id="won-title" className="flex items-center gap-2 text-lg font-semibold">
        <PartyPopper className="size-5 text-brand-strong" aria-hidden /> {t("won.title")}
      </h2>

      {prize && (
        <div className="flex items-center gap-3">
          <Thumb url={prize.imageUrl} size="lg" />
          <p className="min-w-0 font-medium">
            {prize.name}
            {prize.variantName && <span className="text-muted-foreground"> · {prize.variantName}</span>}
          </p>
        </div>
      )}

      {state === "CLAIMED" && (
        <div className="space-y-2" role="status">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CircleCheck className="size-5 text-success" aria-hidden /> {t("won.claimed")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="rounded-full">
              <Link href="/downloads">{t("won.openDownloads")}</Link>
            </Button>
            {orderNumber && (
              <Button asChild variant="outline" className="rounded-full">
                <Link href={`/orders/${orderNumber}`}>{t("won.openOrder", { orderNumber })}</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {(state === "EXPIRED" || state === "FORFEITED") && <p className="text-sm text-muted-foreground">{t("won.expired")}</p>}

      {state === "PENDING" && (
        <>
          <CountdownTimer endsAt={claimDeadline} serverNow={serverNow} label={t("won.claimBy")} endedLabel={t("countdownEnded")} />
          {!block ? (
            <Button size="lg" className="h-12 w-full rounded-full text-base" disabled={pending} aria-busy={pending} onClick={() => claim(null, "prize")}>
              {pendingKey === "prize" ? <Loader2 className="animate-spin" aria-hidden /> : <Gift aria-hidden />}
              {pendingKey === "prize" ? t("won.claiming") : t("won.claim")}
            </Button>
          ) : (
            <SubstitutePicker
              note={t(`won.block.${block}`, { value: money(prizeValue) })}
              options={substitutes}
              pendingKey={pendingKey}
              disabled={pending}
              money={money}
              onPick={(o) => claim({ productId: o.productId, variantId: o.variantId }, keyOf(o))}
            />
          )}
        </>
      )}
    </section>
  );
}

/** Brand-palette confetti, once per win on this device; skipped under reduced motion. Loaded only for winners. */
function useWinConfetti(winnerId: string | null) {
  useEffect(() => {
    if (!winnerId || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const seenKey = `giveaway-confetti:${winnerId}`;
    try {
      if (localStorage.getItem(seenKey)) return;
    } catch {
      // Storage blocked: celebrate anyway.
    }
    let cancelled = false;
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      try {
        localStorage.setItem(seenKey, "1");
      } catch {
        // Not remembered; it may play again next visit.
      }
      const colors = ["#f5bfd4", "#def1f6", "#fff0b8", "#e4d9fb", "#b0426b"];
      confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.35 }, colors, disableForReducedMotion: true });
      window.setTimeout(() => {
        if (!cancelled) confetti({ particleCount: 50, spread: 110, startVelocity: 28, origin: { y: 0.3 }, colors, disableForReducedMotion: true });
      }, 250);
    });
    return () => {
      cancelled = true;
    };
  }, [winnerId]);
}

const keyOf = (o: SubstituteOption) => `${o.productId}:${o.variantId ?? ""}`;

function SubstitutePicker({
  note,
  options,
  pendingKey,
  disabled,
  money,
  onPick,
}: {
  note: string;
  options: SubstituteOption[];
  pendingKey: string | null;
  disabled: boolean;
  money: (satang: number) => string;
  onPick: (o: SubstituteOption) => void;
}) {
  const t = useTranslations("giveaways");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = options.filter((o) => !q || `${o.name} ${o.variantName ?? ""}`.toLowerCase().includes(q));

  return (
    <div className="space-y-3">
      <p className="text-sm">{note}</p>
      <h3 className="text-sm font-semibold">{t("won.pickTitle")}</h3>
      {options.length === 0 ? (
        <p className="rounded-xl bg-background/80 px-4 py-6 text-center text-sm text-muted-foreground">{t("won.pickEmpty")}</p>
      ) : (
        <>
          {options.length > 6 && (
            <label className="relative block">
              <span className="sr-only">{t("won.pickSearch")}</span>
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("won.pickSearch")} className="h-10 rounded-full bg-background pl-9" />
            </label>
          )}
          <ul className="max-h-96 divide-y overflow-y-auto rounded-2xl border bg-background">
            {visible.map((o) => {
              const key = keyOf(o);
              return (
                <li key={key} className="flex items-center gap-3 px-3 py-2.5">
                  <Thumb url={o.imageUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {o.name}
                      {o.variantName && <span className="text-muted-foreground"> · {o.variantName}</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{o.price === 0 ? t("won.free") : money(o.price)}</span>
                  </span>
                  <Button size="sm" variant="outline" className="shrink-0 rounded-full" disabled={disabled} aria-busy={pendingKey === key} onClick={() => onPick(o)}>
                    {pendingKey === key && <Loader2 className="animate-spin" aria-hidden />} {t("won.pick")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Thumb({ url, size = "sm" }: { url: string | null; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "size-16 rounded-2xl" : "size-11 rounded-xl";
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden bg-muted ${box}`}>
      {url ? (
        <PreviewImage src={url} alt="" fill sizes={size === "lg" ? "64px" : "44px"} className="object-cover" />
      ) : (
        <ImageOff className="size-4 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}
