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
import { BannerCarousel, type CarouselBanner } from "@/components/shop/banner-carousel";
import { AnnouncementBar } from "@/components/shop/announcement-bar";
import { getAnnouncementBar, getRandomBannerSettings, listLiveBanners } from "@/lib/banners/queries";
import type { BannerTheme } from "@/lib/generated/prisma/enums";
import { resolveLink } from "@/lib/banners/display";
import type { FadeDirection } from "@/lib/banners/look";
import { previewImageUrl } from "@/lib/storage/public-url";
import {
  listComingSoonProducts,
  listRandomBannerProducts,
  listLimitedTimeProducts,
  listNewestProducts,
  listOnSaleProducts,
  listTrendingProducts,
  TRENDING_WINDOW_DAYS,
  listShopCategories,
  type ProductCardData,
} from "@/lib/products/storefront-queries";

const RANDOM_THEMES: BannerTheme[] = ["PINK", "SKY", "LILAC", "MINT", "BUTTER"];

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection(); // Prices and sale state depend on the current time.
  const now = new Date();
  const user = await getCurrentUser();
  const [t, products, trending, onSale, limitedTime, comingSoon, categories, liveBanners, notice] = await Promise.all([
    getTranslations("home"),
    listNewestProducts(locale, 8, now, user?.id ?? null),
    listTrendingProducts(locale, 4, now, user?.id ?? null),
    listOnSaleProducts(locale, 4, now, user?.id ?? null),
    listLimitedTimeProducts(locale, 4, now, user?.id ?? null),
    listComingSoonProducts(locale, 4, now, user?.id ?? null),
    listShopCategories(now),
    listLiveBanners(now),
    getAnnouncementBar(),
  ]);
  const randomSettings = await getRandomBannerSettings();
  // A new pick on every visit (the page is rendered per request).
  const randomProducts = randomSettings.enabled
    ? await listRandomBannerProducts(locale, randomSettings.count, randomSettings.folderId, now)
    : [];
  const tBanner = await getTranslations("home.banner");
  const shownCategories = categories.filter((c) => c._count.products > 0);
  const banners: CarouselBanner[] = liveBanners.map((b) => {
    const link = resolveLink(b.link);
    return {
      id: b.id,
      title: localized(locale, b.titleTH, b.titleEN),
      tag: localized(locale, b.descriptionTH, b.descriptionEN) || null,
      cta: link ? localized(locale, b.ctaTH, b.ctaEN) || null : null,
      theme: b.theme,
      imageUrl: b.imagePath ? previewImageUrl(b.imagePath) : null,
      focusX: b.imageFocusX,
      focusY: b.imageFocusY,
      zoom: b.imageZoom,
      bgColor: b.bgColor,
      fadeDirection: b.fadeDirection as FadeDirection,
      fadeStrength: b.fadeStrength,
      tintImage: b.tintImage,
      textBlur: b.textBlur,
      fullBlur: b.fullBlur,
      href: link?.href ?? null,
      external: link?.external ?? false,
    };
  });
  // Product cards follow the admin's banners: no price (admin request); a discount tag only for a live discount.
  for (const [i, { card, imageUrl }] of randomProducts.entries()) {
    const p = card.price;
    banners.push({
      id: `product-${card.id}`,
      title: card.name,
      tag: p.isDiscounted ? tBanner("discountTag", { percent: p.discountPercent / 100 }) : card.categoryName,
      cta: tBanner("productCta"),
      theme: RANDOM_THEMES[i % RANDOM_THEMES.length],
      imageUrl,
      focusX: 50,
      focusY: 50,
      zoom: 100,
      bgColor: null,
      fadeDirection: randomSettings.fade ? "LEFT" : "NONE",
      fadeStrength: 60,
      // Product art shows in its own colours.
      tintImage: false,
      textBlur: 60,
      fullBlur: randomSettings.fullBlur,
      href: `/product/${card.slug}`,
      external: false,
    });
  }
  const noticeLink = notice ? resolveLink(notice.link) : null;

  return (
    <>
      {notice && (
        <AnnouncementBar
          text={localized(locale, notice.textTH, notice.textEN) ?? notice.textTH}
          href={noticeLink?.href ?? null}
          external={noticeLink?.external ?? false}
          scroll={notice.scroll}
        />
      )}
      {banners.length > 0 ? (
        // Live banners take the hero's place (client request: a centre-card carousel, not a full-width hero).
        <div className="pt-6 pb-8 sm:pt-8">
          <h1 className="sr-only">{t("hero.title")}</h1>
          <BannerCarousel banners={banners} />
        </div>
      ) : (
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
      )}

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
      <Shelf
        id="coming-soon"
        title={t("comingSoon")}
        hint={t("comingSoonHint")}
        products={comingSoon}
        viewAll={{ href: "/shop?soon=1", label: t("viewAll") }}
      />
      <Shelf id="trending" title={t("trending")} hint={t("trendingHint", { days: TRENDING_WINDOW_DAYS })} products={trending} />
      <Shelf id="limited-time" title={t("limitedTime")} hint={t("limitedTimeHint")} products={limitedTime} />
      <Shelf
        id="new-arrivals"
        title={t("newArrivals")}
        products={products}
        always
        viewAll={products.length > 0 ? { href: "/shop", label: t("viewAll") } : undefined}
      />

      {banners.length === 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-20">
          <BannerSlot fallbackProducts={products} />
        </section>
      )}
      {banners.length > 0 && <div className="pb-20" />}
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
