import { getTranslations } from "next-intl/server";
import { Stars } from "@/components/reviews/stars";
import { ReviewList } from "@/components/reviews/review-list";
import { ReviewWriteButton } from "@/components/reviews/review-write-button";
import { getReviewSummary, listProductReviews } from "@/lib/reviews/queries";
import { hasSessionCookie } from "@/lib/auth/guards";
import { ratingAverage, reviewerName } from "@/lib/reviews/rules";

/** Product-page reviews: average, per-star bars, write button and the first page of reviews. */
export async function ReviewSection({ productId, productName, productSlug }: { productId: string; productName: string; productSlug: string }) {
  const t = await getTranslations("shop.reviews");
  const [summary, first, hasSession] = await Promise.all([
    getReviewSummary(productId),
    listProductReviews(productId, 1),
    hasSessionCookie(),
  ]);
  const average = ratingAverage(summary.sum, summary.count);

  return (
    <section aria-labelledby="reviews-heading" className="space-y-6">
      <h2 id="reviews-heading" className="text-xl">
        {t("title")}
      </h2>
      <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)] md:items-center">
        <div className="space-y-2">
          {summary.count > 0 ? (
            <>
              <p className="text-4xl font-semibold tabular-nums">
                {average.toFixed(1)}
                <span className="text-base font-normal text-muted-foreground"> / 5</span>
              </p>
              <Stars value={average} size="size-5" />
              <p className="text-sm text-muted-foreground">{t("count", { count: summary.count })}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          )}
          <div className="pt-2">
            <ReviewWriteButton productId={productId} productName={productName} productSlug={productSlug} hasSession={hasSession} />
          </div>
        </div>
        <ul className="space-y-2" aria-label={t("distribution")}>
          {summary.distribution.map((b) => (
            <li key={b.stars} className="flex items-center gap-3 text-sm">
              <span className="w-14 shrink-0 tabular-nums">{t("starsShort", { count: b.stars })}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${b.percent}%`}>
                <div className="h-full rounded-full bg-brand-strong" style={{ width: `${b.percent}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">
                {b.percent}% ({b.count})
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ReviewList
        productId={productId}
        initialHasMore={first.hasMore}
        initial={first.rows.map((r) => ({
          id: r.id,
          rating: r.rating,
          body: r.body,
          createdAt: r.createdAt.toISOString(),
          name: r.isAnonymous ? "" : reviewerName(r.user.displayName, ""),
          anonymous: r.isAnonymous,
        }))}
      />
    </section>
  );
}
