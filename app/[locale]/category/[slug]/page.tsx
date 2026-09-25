import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localize";
import { parseShopFilters, shopFilterParams } from "@/lib/products/storefront";
import { getShopCategory, listShopProducts } from "@/lib/products/storefront-queries";
import { PageHeading } from "@/components/shop/page-heading";
import { ProductGrid } from "@/components/shop/product-grid";
import { ShopFilterForm } from "@/components/shop/shop-filters";
import { ShopPagination } from "@/components/shop/shop-pagination";

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[locale]/category/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await getShopCategory(slug);
  if (!category) notFound();
  const { q, sale, sort, page } = parseShopFilters(await searchParams);
  const path = `/category/${category.slug}`;
  return {
    title: localized(locale, category.nameTH, category.nameEN),
    description: localized(locale, category.descriptionTH, category.descriptionEN) ?? undefined,
    alternates: { canonical: `/${locale}${path}`, languages: { th: `/th${path}`, en: `/en${path}` } },
    robots: q || sale || sort !== "newest" || page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/[locale]/category/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const category = await getShopCategory(slug);
  if (!category) notFound();

  const [t, tNav] = await Promise.all([getTranslations("shop.shop"), getTranslations("common.nav")]);
  // The category comes from the URL, not the query string.
  const filters = { ...parseShopFilters(await searchParams), category: undefined };
  const { items, total, pageCount } = await listShopProducts({ ...filters, categoryId: category.id }, locale);
  const path = `/category/${category.slug}`;
  const description = localized(locale, category.descriptionTH, category.descriptionEN);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/category" className="hover:text-foreground hover:underline">
          {tNav("categories")}
        </Link>
      </nav>
      <PageHeading
        title={localized(locale, category.nameTH, category.nameEN)}
        subtitle={
          <>
            {description && <span className="block">{description}</span>}
            {t("resultCount", { count: total })}
          </>
        }
      />
      <ShopFilterForm filters={filters} action={path} />
      <ProductGrid products={items} filtered={Boolean(filters.q || filters.sale)} />
      <ShopPagination page={filters.page} pageCount={pageCount} params={shopFilterParams(filters)} path={path} />
    </div>
  );
}
