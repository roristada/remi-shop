import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localized } from "@/i18n/localize";
import { hasShopFilters, parseShopFilters, shopFilterParams, type ShopFilters } from "@/lib/products/storefront";
import {
  getShopCategory,
  getShopFolder,
  listShopCategories,
  listShopFolderSections,
  listShopFolders,
  listShopProducts,
} from "@/lib/products/storefront-queries";
import { PageHeading } from "@/components/shop/page-heading";
import { ProductGrid } from "@/components/shop/product-grid";
import { ShopFilterForm } from "@/components/shop/shop-filters";
import { ShopPagination } from "@/components/shop/shop-pagination";
import { FolderSection } from "@/components/shop/folder-section";
import { ShopViewNav } from "@/components/shop/shop-view-nav";

type SearchParams = Record<string, string | string[] | undefined>;

/** `?view=all` shows the flat grid without any filter; otherwise the bare /shop groups by folder. */
function wantsAllView(sp: SearchParams) {
  return sp.view === "all";
}

export async function generateMetadata({ params, searchParams }: PageProps<"/[locale]/shop">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.meta" });
  const sp = await searchParams;
  const filters = parseShopFilters(sp);
  return {
    title: filters.q ? t("searchTitle", { q: filters.q }) : t("shopTitle"),
    description: t("shopDescription"),
    alternates: { canonical: `/${locale}/shop`, languages: { th: "/th/shop", en: "/en/shop" } },
    // Filtered, search and alternate-view pages are thin duplicates of /shop.
    robots: hasShopFilters(filters) || wantsAllView(sp) ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ params, searchParams }: PageProps<"/[locale]/shop">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("shop.shop");
  const now = new Date();
  const sp = await searchParams;

  const parsed = parseShopFilters(sp);
  const [category, folder] = await Promise.all([
    parsed.category ? getShopCategory(parsed.category) : null,
    parsed.folder ? getShopFolder(parsed.folder) : null,
  ]);
  // Unknown category/folder slugs are ignored rather than returning an empty page.
  const filters: ShopFilters = { ...parsed, category: category?.slug, folder: folder?.slug };

  if (!wantsAllView(sp) && !hasShopFilters(filters)) {
    const sections = await listShopFolderSections(locale, now);
    // Folder view only makes sense once at least one folder lists products.
    if (sections.some((s) => s.slug !== null)) {
      const total = sections.reduce((sum, s) => sum + s.total, 0);
      return (
        <ShopShell title={t("title")} subtitle={t("resultCount", { count: total })}>
          <ShopViewNav
            view="folders"
            folders={sections.map((s) => ({ slug: s.slug, name: s.name ?? "" }))}
          />
          <FilterForm locale={locale} filters={filters} view="folders" now={now} />
          <div className="space-y-12">
            {sections.map((s, i) => (
              <FolderSection key={s.slug ?? "unfiled"} section={s} priority={i === 0} />
            ))}
          </div>
        </ShopShell>
      );
    }
  }

  const [{ items, total, pageCount }, folders] = await Promise.all([
    listShopProducts({ ...filters, categoryId: category?.id, folderId: folder?.id }, locale, now),
    listShopFolders(now),
  ]);
  const folderName = folder ? localized(locale, folder.nameTH, folder.nameEN) : null;

  return (
    <ShopShell
      title={filters.q ? t("searchResults", { q: filters.q }) : (folderName ?? t("title"))}
      subtitle={t("resultCount", { count: total })}
    >
      {folders.length > 0 && (
        <ShopViewNav
          view="all"
          activeFolder={filters.folder}
          folders={folders.map((f) => ({ slug: f.slug, name: localized(locale, f.nameTH, f.nameEN) }))}
        />
      )}
      <FilterForm locale={locale} filters={filters} view="all" now={now} />
      <ProductGrid products={items} filtered={Boolean(filters.q || filters.category || filters.folder || filters.sale)} />
      <ShopPagination
        page={filters.page}
        pageCount={pageCount}
        params={{ ...shopFilterParams(filters), view: "all" }}
        path="/shop"
      />
    </ShopShell>
  );
}

function ShopShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:py-12">
      <PageHeading title={title} subtitle={subtitle} />
      {children}
    </div>
  );
}

async function FilterForm({
  locale,
  filters,
  view,
  now,
}: {
  locale: string;
  filters: ShopFilters;
  view: "folders" | "all";
  now: Date;
}) {
  const categories = await listShopCategories(now);
  return (
    <ShopFilterForm
      filters={filters}
      action="/shop"
      categories={categories.map((c) => ({ slug: c.slug, name: localized(locale, c.nameTH, c.nameEN) }))}
      // Submitting from the folder view applies filters, which switches to the grid anyway.
      hiddenFields={view === "all" ? { view: "all", folder: filters.folder } : undefined}
      clearHref={view === "all" ? "/shop?view=all" : "/shop"}
    />
  );
}
