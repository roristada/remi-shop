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
  type ProductCardData,
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
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-12 sm:pt-14 md:grid-cols-[1.05fr_1fr] md:gap-12">
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

      <section aria-label={t("trust.label")} className="border-y bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <TrustBar />
        </div>
      </section>

      {shownCategories.length > 0 && (
        <nav aria-label={t("browseByType")} className="mx-auto max-w-6xl px-4 pt-10">
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {shownCategories.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full border bg-background px-4 text-sm transition-colors hover:border-foreground/20 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {localized(locale, c.nameTH, c.nameEN)}
                  <span className="text-xs text-muted-foreground tabular-nums">{c._count.products}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Rows exist only while something qualifies, so the page never shows an empty shelf. */}
      <Shelf id="on-sale" title={t("onSale")} products={onSale} viewAll={{ href: "/shop?sale=1", label: t("viewAll") }} />
      <Shelf id="coming-soon" title={t("comingSoon")} hint={t("comingSoonHint")} products={comingSoon} />
      <Shelf id="trending" title={t("trending")} hint={t("trendingHint", { days: TRENDING_WINDOW_DAYS })} products={trending} />
      <Shelf id="limited-time" title={t("limitedTime")} hint={t("limitedTimeHint")} products={limitedTime} />
      <Shelf
        id="new-arrivals"
        title={t("newArrivals")}
        products={products}
        always
        viewAll={products.length > 0 ? { href: "/shop", label: t("viewAll") } : undefined}
      />

      <section className="mx-auto max-w-6xl px-4 pt-14 pb-20">
        <BannerSlot announcement={announcement} fallbackProducts={products} />
      </section>
    </>
  );
}

/** One product row: heading, optional hint and "view all", then the grid. Hidden when empty unless `always`. */
function Shelf({
  id,
  title,
  hint,
  products,
  viewAll,
  always = false,
}: {
  id: string;
  title: string;
  hint?: string;
  products: ProductCardData[];
  viewAll?: { href: string; label: string };
  always?: boolean;
}) {
  if (products.length === 0 && !always) return null;
  return (
    <section aria-labelledby={id} className="mx-auto max-w-6xl space-y-5 px-4 pt-14">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id={id} className="text-2xl sm:text-[1.75rem]">
            {title}
          </h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {viewAll && (
          <Link href={viewAll.href} className="shrink-0 text-sm font-medium text-brand-strong underline-offset-4 hover:underline">
            {viewAll.label}
          </Link>
        )}
      </div>
      <ProductGrid products={products} priority={false} />
    </section>
  );
}
