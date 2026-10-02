import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localize";
import { getCurrentUser } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { ProductGrid } from "@/components/shop/product-grid";
import { SwatchStack } from "@/components/shop/swatch-stack";
import { TrustBar } from "@/components/shop/trust-bar";
import { BannerSlot } from "@/components/shop/banner-slot";
import {
  getActiveAnnouncement,
  listComingSoonProducts,
  listLimitedTimeProducts,
  listNewestProducts,
  listOnSaleProducts,
  listTrendingProducts,
  TRENDING_WINDOW_DAYS,
  listShopCategories,
} from "@/lib/products/storefront-queries";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection(); // Prices and sale state depend on the current time.
  const now = new Date();
  const user = await getCurrentUser();
  const [t, products, trending, onSale, limitedTime, comingSoon, categories, announcement] = await Promise.all([
    getTranslations("home"),
    listNewestProducts(locale, 8, now, user?.id ?? null),
    listTrendingProducts(locale, 4, now, user?.id ?? null),
    listOnSaleProducts(locale, 4, now, user?.id ?? null),
    listLimitedTimeProducts(locale, 4, now, user?.id ?? null),
    listComingSoonProducts(locale, 4, now, user?.id ?? null),
    listShopCategories(now),
    getActiveAnnouncement(now),
  ]);
  const shownCategories = categories.filter((c) => c._count.products > 0);

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-14 sm:pt-16 md:grid-cols-[1.05fr_1fr] md:gap-12 md:pb-12">
        <div className="space-y-6">
          <h1 className="text-[2rem] leading-[1.25] text-balance sm:text-5xl sm:leading-[1.2]">{t("hero.title")}</h1>
          <p className="max-w-md text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            {t("hero.subtitle")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
              <Link href="/shop">{t("hero.cta")}</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-12 rounded-full px-5 text-base">
              <Link href="/category">{t("hero.secondary")}</Link>
            </Button>
          </div>
        </div>
        <SwatchStack products={products} caption={t("hero.caption")} />
      </section>

      <section aria-label={t("trust.label")} className="mx-auto max-w-6xl px-4 pb-12">
        <TrustBar />
      </section>

      {shownCategories.length > 0 && (
        <nav aria-label={t("browseByType")} className="mx-auto max-w-6xl px-4 pb-12">
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {shownCategories.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-flex h-11 items-center gap-2 rounded-full border bg-background px-4 text-sm transition-colors hover:border-foreground/20 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {localized(locale, c.nameTH, c.nameEN)}
                  <span className="text-xs text-muted-foreground tabular-nums">{c._count.products}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* These rows exist only while something qualifies, so the page never shows an empty shelf. */}
      {onSale.length > 0 && (
        <section aria-labelledby="on-sale" className="mx-auto max-w-6xl space-y-6 px-4 pb-16">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="on-sale" className="text-2xl sm:text-3xl">
              {t("onSale")}
            </h2>
            <Link href="/shop?sale=1" className="text-sm font-medium text-brand-strong underline-offset-4 hover:underline">
              {t("viewAll")}
            </Link>
          </div>
          <ProductGrid products={onSale} priority={false} />
        </section>
      )}

      {comingSoon.length > 0 && (
        <section aria-labelledby="coming-soon" className="mx-auto max-w-6xl space-y-6 px-4 pb-16">
          <div className="space-y-1">
            <h2 id="coming-soon" className="text-2xl sm:text-3xl">
              {t("comingSoon")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("comingSoonHint")}</p>
          </div>
          <ProductGrid products={comingSoon} priority={false} />
        </section>
      )}

      {trending.length > 0 && (
        <section aria-labelledby="trending" className="mx-auto max-w-6xl space-y-6 px-4 pb-16">
          <div className="space-y-1">
            <h2 id="trending" className="text-2xl sm:text-3xl">
              {t("trending")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("trendingHint", { days: TRENDING_WINDOW_DAYS })}</p>
          </div>
          <ProductGrid products={trending} priority={false} />
        </section>
      )}

      {limitedTime.length > 0 && (
        <section aria-labelledby="limited-time" className="mx-auto max-w-6xl space-y-6 px-4 pb-16">
          <div className="space-y-1">
            <h2 id="limited-time" className="text-2xl sm:text-3xl">
              {t("limitedTime")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("limitedTimeHint")}</p>
          </div>
          <ProductGrid products={limitedTime} priority={false} />
        </section>
      )}

      <section aria-labelledby="new-arrivals" className="mx-auto max-w-6xl space-y-6 px-4 pb-20">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="new-arrivals" className="text-2xl sm:text-3xl">
            {t("newArrivals")}
          </h2>
          {products.length > 0 && (
            <Link href="/shop" className="text-sm font-medium text-brand-strong underline-offset-4 hover:underline">
              {t("viewAll")}
            </Link>
          )}
        </div>
        <ProductGrid products={products} />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <BannerSlot announcement={announcement} fallbackProducts={products} />
      </section>
    </>
  );
}
