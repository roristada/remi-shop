import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Heart } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { listWishlistProducts } from "@/lib/products/storefront-queries";
import { PageHeading } from "@/components/shop/page-heading";
import { ProductGrid } from "@/components/shop/product-grid";
import { ShopPagination } from "@/components/shop/shop-pagination";
import { BackLink } from "@/components/shared/back-link";

export async function generateMetadata({ params }: PageProps<"/[locale]/wishlist">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.wishlist" });
  return { title: t("title"), robots: { index: false } };
}

export default async function WishlistPage({ params, searchParams }: PageProps<"/[locale]/wishlist">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/${locale}/login?next=${encodeURIComponent(`/${locale}/wishlist`)}`);
  const sp = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));

  const [t, { items, total, pageCount }] = await Promise.all([
    getTranslations("shop.wishlist"),
    listWishlistProducts(user.id, locale, page),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-12">
      <BackLink href="/account">{(await getTranslations("common.state"))("backToAccount")}</BackLink>
      <PageHeading title={t("title")} subtitle={t("resultCount", { count: total })} />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-background/80 px-4 py-16 text-center">
          <Heart className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("empty")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <ProductGrid products={items} />
      )}
      <ShopPagination page={page} pageCount={pageCount} params={{}} path="/wishlist" />
    </div>
  );
}
