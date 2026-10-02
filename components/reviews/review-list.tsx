"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stars } from "@/components/reviews/stars";
import { intlLocale } from "@/i18n/localize";
import { loadMoreReviews } from "@/lib/reviews/actions";

/** `name` is empty for an anonymous review (the server never sends it). */
export type ReviewItem = { id: string; rating: number; body: string; createdAt: string; name: string; anonymous: boolean };

/** First page comes from the server; "load more" pages through a public server action. */
export function ReviewList({ productId, initial, initialHasMore }: { productId: string; initial: ReviewItem[]; initialHasMore: boolean }) {
  const t = useTranslations("shop.reviews");
  const locale = useLocale();
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const date = new Intl.DateTimeFormat(intlLocale(locale).date, { dateStyle: "medium", timeZone: "Asia/Bangkok" });

  function more() {
    setFailed(false);
    startTransition(async () => {
      try {
        const next = await loadMoreReviews(productId, page + 1);
        setItems((prev) => [...prev, ...next.rows.filter((r) => !prev.some((p) => p.id === r.id))]);
        setHasMore(next.hasMore);
        setPage((p) => p + 1);
      } catch {
        setFailed(true);
      }
    });
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("none")}</p>;

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-3xl border">
        {items.map((r) => (
          <li key={r.id} className="space-y-2 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stars value={r.rating} />
              <span className="sr-only">{t("starsOption", { count: r.rating })}</span>
              <span className="text-sm font-medium">{r.anonymous ? t("anonymousName") : r.name || t("anonymous")}</span>
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <BadgeCheck className="size-3.5" aria-hidden /> {t("verified")}
              </span>
              <time dateTime={r.createdAt} className="text-xs text-muted-foreground">
                {date.format(new Date(r.createdAt))}
              </time>
            </div>
            {r.body && <p className="text-sm leading-relaxed whitespace-pre-line break-words">{r.body}</p>}
          </li>
        ))}
      </ul>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("errors.ERROR")}
        </p>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={more} disabled={pending} aria-busy={pending} className="h-11 rounded-full px-6">
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
