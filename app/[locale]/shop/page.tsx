import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localized } from "@/i18n/localize";
import { getCurrentUser } from "@/lib/auth/guards";
import { hasShopFilters, parseShopFilters, shopFilterParams, type ShopFilters } from "@/lib/products/storefront";
import {
  getShopFolder,
  listPriceBucketCounts,
  listShopCategories,
  listShopFolderSections,
  listShopFolders,
  listShopProducts,
} from "@/lib/products/storefront-queries";
import { listActiveSoftwareTags } from "@/lib/software-tags/queries";
import { PageHeading } from "@/components/shop/page-heading";
import { ProductGrid } from "@/components/shop/product-grid";
import { ShopFilterForm } from "@/components/shop/shop-filters";
import { ShopSidebarFilters } from "@/components/shop/shop-sidebar-filters";
import { ShopPagination } from "@/components/shop/shop-pagination";
import { FolderSection } from "@/components/shop/folder-section";
import { ShopViewNav } from "@/components/shop/shop-view-nav";

type SearchParams = Record<string, string | string[] | undefined>;

/** The bare /shop is the flat "All" grid; `?view=folders` groups products by folder. */
function wantsFolderView(sp: SearchParams) {
  return sp.view === "folders";
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
    robots: hasShopFilters(filters) || wantsFolderView(sp) ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ params, searchParams }: PageProps<"/[locale]/shop">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("shop.shop");
  const now = new Date();
  const sp = await searchParams;

  const parsed = parseShopFilters(sp);
  const [folder, user] = await Promise.all([
    parsed.folder ? getShopFolder(parsed.folder) : Promise.resolve(null),
    getCurrentUser(),
  ]);
  // An unknown folder slug is ignored rather than returning an empty page.
  const filters: ShopFilters = { ...parsed, folder: folder?.slug };
  const userId = user?.id ?? null;

  if (wantsFolderView(sp) && !hasShopFilters(filters)) {
    const sections = await listShopFolderSections(locale, now, userId);
    // Folder view only makes sense once at least one folder lists products.
    if (sections.some((s) => s.slug !== null)) {
      const total = sections.reduce((sum, s) => sum + s.total, 0);
      return (
        <ShopShell title={t("title")} subtitle={t("resultCount", { count: total })}>
          <ShopViewNav
            view="folders"
            folders={sections.map((s) => ({ slug: s.slug, name: s.name ?? "" }))}
          />
          <ShopFilterForm filters={filters} action="/shop" />
          <div className="space-y-12">
            {sections.map((s, i) => (
              <FolderSection key={s.slug ?? "unfiled"} section={s} priority={i === 0} />
            ))}
          </div>
        </ShopShell>
      );
    }
  }

  const facetFilters = { q: filters.q, sale: filters.sale };
  const [{ items, total, pageCount }, folders, categories, softwareTags, priceCounts] = await Promise.all([
    listShopProducts({ ...filters, folderId: folder?.id }, locale, now, userId),
    listShopFolders(now),
    listShopCategories(now, facetFilters),
    listActiveSoftwareTags(now, facetFilters),
    listPriceBucketCounts(now, facetFilters),
  ]);
  const folderName = folder ? localized(locale, folder.nameTH, folder.nameEN) : null;
  const sidebarHidden = { q: filters.q, sort: filters.sort === "newest" ? undefined : filters.sort, sale: filters.sale ? "1" : undefined, folder: filters.folder };

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
      <ShopFilterForm
        filters={filters}
        action="/shop"
        hiddenFields={{ folder: filters.folder }}
        clearHref="/shop"
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <ShopSidebarFilters
          filters={filters}
          action="/shop"
          hiddenFields={sidebarHidden}
          clearHref="/shop"
          categories={categories.map((c) => ({ slug: c.slug, name: localized(locale, c.nameTH, c.nameEN), count: c._count.products }))}
          softwareTags={softwareTags.map((s) => ({ id: s.id, name: s.name, count: s._count.products }))}
          priceCounts={priceCounts}
        />
        <div className="min-w-0 flex-1 space-y-6">
          {/* Keeps the outline h1 → h2 → card h3 in the flat grid (folder view has section h2s). */}
          <h2 className="sr-only">{t("products")}</h2>
          <ProductGrid
            products={items}
            filtered={Boolean(filters.q || filters.category.length > 0 || filters.folder || filters.software.length > 0 || filters.price || filters.sale)}
          />
          <ShopPagination
            page={filters.page}
            pageCount={pageCount}
            params={shopFilterParams(filters)}
            path="/shop"
          />
        </div>
      </div>
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
