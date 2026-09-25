import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localized } from "@/i18n/localize";
import { parseShopFilters, shopFilterParams } from "@/lib/products/storefront";
import { getShopCategory, listShopCategories, listShopProducts } from "@/lib/products/storefront-queries";
import { PageHeading } from "@/components/shop/page-heading";
import { ProductGrid } from "@/components/shop/product-grid";
import { ShopFilterForm } from "@/components/shop/shop-filters";
import { ShopPagination } from "@/components/shop/shop-pagination";

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/shop">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.meta" });
  const filters = parseShopFilters(await searchParams);
  const filtered = Boolean(filters.q || filters.category || filters.sale || filters.sort !== "newest" || filters.page > 1);
  return {
    title: filters.q ? t("searchTitle", { q: filters.q }) : t("shopTitle"),
    description: t("shopDescription"),
    alternates: { canonical: `/${locale}/shop`, languages: { th: "/th/shop", en: "/en/shop" } },
    // Filtered and search result pages are thin duplicates of /shop.
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ params, searchParams }: PageProps<"/[locale]/shop">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("shop.shop");
  const now = new Date();

  const parsed = parseShopFilters(await searchParams);
  const category = parsed.category ? await getShopCategory(parsed.category) : null;
  // An unknown category slug is ignored rather than returning an empty page.
  const filters = { ...parsed, category: category?.slug };

  const [{ items, total, pageCount }, categories] = await Promise.all([
    listShopProducts({ ...filters, categoryId: category?.id }, locale, now),
    listShopCategories(now),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-12">
      <PageHeading
        title={filters.q ? t("searchResults", { q: filters.q }) : t("title")}
        subtitle={t("resultCount", { count: total })}
      />
      <ShopFilterForm
        filters={filters}
        action="/shop"
        categories={categories.map((c) => ({ slug: c.slug, name: localized(locale, c.nameTH, c.nameEN) }))}
      />
      <ProductGrid products={items} filtered={Boolean(filters.q || filters.category || filters.sale)} />
      <ShopPagination page={filters.page} pageCount={pageCount} params={shopFilterParams(filters)} path="/shop" />
    </div>
  );
}
