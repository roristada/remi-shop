import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { localized } from "@/i18n/localize";
import { calculateProductPrice, type ProductPrice } from "@/lib/pricing/calculate";
import { getProductStatus, type ProductStatus } from "@/lib/products/status";
import {
  isSoldOut,
  stockTakenCountSelect,
  stockTakingOrderWhere,
  toStockInfo,
  variantStockTakenCountSelect,
  type StockInfo,
} from "@/lib/products/stock";
import { previewImageUrl } from "@/lib/storage/public-url";
import { ratingAverage } from "@/lib/reviews/rules";
import {
  activeDiscountWhere,
  facetBaseWhere,
  listedProductWhere,
  PRICE_BUCKETS,
  priceBucketWhere,
  SHOP_PAGE_SIZE,
  shopOrderBy,
  shopSearchWhere,
  type PriceBucketKey,
  type ShopFilters,
} from "@/lib/products/storefront";

// Storefront reads only. Never select storage paths of digital files here.

/** Never a real user id (Supabase Auth never issues the nil UUID) — a guest-safe "matches nothing". */
const NO_USER = "00000000-0000-0000-0000-000000000000";

/**
 * `userId` folds in this viewer's wishlist membership in the same query (the nil-UUID sentinel
 * for guests matches no row, so the shape stays identical either way).
 */
function cardSelect(userId: string | null, now: Date) {
  return {
    id: true,
    slug: true,
    nameTH: true,
    nameEN: true,
    price: true,
    discountPercent: true,
    discountStartAt: true,
    discountEndAt: true,
    publishStatus: true,
    saleStartAt: true,
    saleEndAt: true,
    ratingCount: true,
    ratingSum: true,
    softwareTags: {
      select: { softwareTag: { select: { name: true } } },
      orderBy: { softwareTag: { sortOrder: "asc" } },
    },
    category: { select: { slug: true, nameTH: true, nameEN: true } },
    images: {
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      take: 1,
      select: { imagePath: true, altTextTH: true, altTextEN: true },
    },
    wishlist: { where: { userId: userId ?? NO_USER }, select: { userId: true }, take: 1 },
    stockLimit: true,
    _count: { select: { ...stockTakenCountSelect(now), variants: true } },
    variants: {
      where: { isActive: true },
      select: {
        price: true,
        discountPercent: true,
        discountStartAt: true,
        discountEndAt: true,
        stockLimit: true,
        _count: { select: variantStockTakenCountSelect(now) },
      },
    },
  } satisfies Prisma.ProductSelect;
}

type CardRow = Prisma.ProductGetPayload<{ select: ReturnType<typeof cardSelect> }>;

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  softwareTags: string[];
  image: { url: string; alt: string } | null;
  price: ProductPrice;
  status: ProductStatus;
  wishlisted: boolean;
  rating: { average: number; count: number };
  /** null = unlimited (no stock shown). Always null for a product with variants. */
  stock: StockInfo;
  /** Price is the cheapest active variant's ("from"). */
  priceFrom: boolean;
  /** Every active variant is sold out (products with variants only). */
  variantsSoldOut: boolean;
};

/** Card price and stock: the product's own, or for a product with variants the cheapest active one. */
function cardPricing(row: CardRow, now: Date): Pick<ProductCardData, "price" | "stock" | "priceFrom" | "variantsSoldOut"> {
  if (row._count.variants === 0) {
    return {
      price: calculateProductPrice(row, now),
      stock: toStockInfo(row.stockLimit, row._count.orderItems),
      priceFrom: false,
      variantsSoldOut: false,
    };
  }
  const prices = row.variants.map((v) => calculateProductPrice(v, now));
  const cheapest = prices.reduce<ReturnType<typeof calculateProductPrice> | null>(
    (min, p) => (min === null || p.finalPrice < min.finalPrice ? p : min),
    null,
  );
  return {
    // No active variant: the product's own price, only for display (it cannot be bought).
    price: cheapest ?? calculateProductPrice(row, now),
    stock: null,
    priceFrom: row.variants.length > 1,
    variantsSoldOut:
      row.variants.length > 0 && row.variants.every((v) => isSoldOut(toStockInfo(v.stockLimit, v._count.orderItems))),
  };
}

function toCard(row: CardRow, locale: string, now: Date): ProductCardData {
  const name = localized(locale, row.nameTH, row.nameEN);
  const image = row.images[0];
  return {
    id: row.id,
    slug: row.slug,
    name,
    categoryName: localized(locale, row.category.nameTH, row.category.nameEN),
    softwareTags: row.softwareTags.map((t) => t.softwareTag.name),
    image: image
      ? { url: previewImageUrl(image.imagePath), alt: localized(locale, image.altTextTH, image.altTextEN) || name }
      : null,
    ...cardPricing(row, now),
    status: getProductStatus(row, now),
    wishlisted: row.wishlist.length > 0,
    rating: { average: ratingAverage(row.ratingSum, row.ratingCount), count: row.ratingCount },
  };
}

export async function listShopProducts(
  filters: ShopFilters & { categoryId?: string; folderId?: string },
  locale: string,
  now: Date = new Date(),
  userId: string | null = null,
) {
  const and: Prisma.ProductWhereInput[] = [listedProductWhere(now)];
  // A fixed route category (category/folder page) wins over the sidebar's multi-select.
  if (filters.categoryId) {
    and.push({ categoryId: filters.categoryId });
  } else if (filters.category.length > 0) {
    const matched = await prisma.category.findMany({
      where: { slug: { in: filters.category }, status: "ACTIVE" },
      select: { id: true },
    });
    and.push({ categoryId: { in: matched.map((c) => c.id) } });
  }
  if (filters.folderId) and.push({ folderId: filters.folderId });
  if (filters.software.length > 0) and.push({ softwareTags: { some: { softwareTagId: { in: filters.software } } } });
  if (filters.price) and.push(priceBucketWhere(filters.price));
  if (filters.q) and.push(shopSearchWhere(filters.q));
  if (filters.sale) and.push(activeDiscountWhere(now));
  const where: Prisma.ProductWhereInput = { AND: and };

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: shopOrderBy(filters.sort, locale),
      skip: (filters.page - 1) * SHOP_PAGE_SIZE,
      take: SHOP_PAGE_SIZE,
      select: cardSelect(userId, now),
    }),
  ]);

  return {
    items: rows.map((r) => toCard(r, locale, now)),
    total,
    pageCount: Math.max(1, Math.ceil(total / SHOP_PAGE_SIZE)),
  };
}

export async function listNewestProducts(locale: string, take = 8, now: Date = new Date(), userId: string | null = null) {
  const rows = await prisma.product.findMany({
    where: listedProductWhere(now),
    orderBy: shopOrderBy("newest", locale),
    take,
    select: cardSelect(userId, now),
  });
  return rows.map((r) => toCard(r, locale, now));
}

/** Selling right now: sale window already open (or not set). `listedProductWhere` excludes ended ones. */
const openNowWhere = (now: Date): Prisma.ProductWhereInput => ({
  OR: [{ saleStartAt: null }, { saleStartAt: { lte: now } }],
});

/** Homepage "on sale" row: an active discount, biggest discount first. Empty when nothing qualifies. */
export async function listOnSaleProducts(locale: string, take = 4, now: Date = new Date(), userId: string | null = null) {
  const rows = await prisma.product.findMany({
    where: { AND: [listedProductWhere(now), openNowWhere(now), activeDiscountWhere(now)] },
    orderBy: [{ discountPercent: "desc" }, { publishedAt: "desc" }],
    take,
    select: cardSelect(userId, now),
  });
  return rows.map((r) => toCard(r, locale, now));
}

/** Homepage "limited time" row: on sale now with an end date, ending soonest first. */
export async function listLimitedTimeProducts(
  locale: string,
  take = 4,
  now: Date = new Date(),
  userId: string | null = null,
) {
  const rows = await prisma.product.findMany({
    where: { AND: [listedProductWhere(now), openNowWhere(now), { saleEndAt: { gt: now } }] },
    orderBy: { saleEndAt: "asc" },
    take,
    select: cardSelect(userId, now),
  });
  return rows.map((r) => toCard(r, locale, now));
}

export const WISHLIST_PAGE_SIZE = 12;

/**
 * A customer's saved products, most recently saved first. A product that's no longer listed
 * (unpublished, hidden category, sale ended) silently drops off — lower stakes than a cart, so no
 * "problem" badge, unlike cart lines.
 */
export async function listWishlistProducts(userId: string, locale: string, page: number, now: Date = new Date()) {
  const where: Prisma.WishlistWhereInput = { userId, product: listedProductWhere(now) };
  const [total, rows] = await prisma.$transaction([
    prisma.wishlist.count({ where }),
    prisma.wishlist.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * WISHLIST_PAGE_SIZE,
      take: WISHLIST_PAGE_SIZE,
      select: { product: { select: cardSelect(userId, now) } },
    }),
  ]);
  return {
    items: rows.map((r) => toCard(r.product, locale, now)),
    total,
    pageCount: Math.max(1, Math.ceil(total / WISHLIST_PAGE_SIZE)),
  };
}

export async function listRelatedProducts(
  categoryId: string,
  excludeId: string,
  locale: string,
  now: Date = new Date(),
  take = 4,
  userId: string | null = null,
) {
  const rows = await prisma.product.findMany({
    where: { AND: [listedProductWhere(now), { categoryId, id: { not: excludeId } }] },
    orderBy: shopOrderBy("newest", locale),
    take,
    select: cardSelect(userId, now),
  });
  return rows.map((r) => toCard(r, locale, now));
}

/**
 * The one home-page banner slot: the highest-priority live announcement, or null when none is
 * running. Never render a discount here unless it is this real row's own content.
 */
export function getActiveAnnouncement(now: Date = new Date()) {
  return prisma.announcement.findFirst({
    where: {
      isActive: true,
      OR: [{ startAt: null }, { startAt: { lte: now } }],
      AND: [{ OR: [{ endAt: null }, { endAt: { gt: now } }] }],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: { titleTH: true, titleEN: true, descriptionTH: true, descriptionEN: true, imagePath: true, link: true },
  });
}

/**
 * Visible categories with a product count. `facetFilters` folds in search/on-sale so the
 * sidebar's counts stay honest under those, independent of the other facet groups — see
 * `facetBaseWhere`.
 */
export function listShopCategories(now: Date = new Date(), facetFilters: { q?: string; sale: boolean } = { sale: false }) {
  return prisma.category.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { nameTH: "asc" }],
    select: {
      id: true,
      slug: true,
      nameTH: true,
      nameEN: true,
      descriptionTH: true,
      descriptionEN: true,
      _count: { select: { products: { where: facetBaseWhere(now, facetFilters) } } },
    },
  });
}

/** Price-bucket counts for the sidebar, under the same independent-facet rule as categories. */
export async function listPriceBucketCounts(
  now: Date,
  facetFilters: { q?: string; sale: boolean },
): Promise<{ key: PriceBucketKey; count: number }[]> {
  const base = facetBaseWhere(now, facetFilters);
  const counts = await Promise.all(
    PRICE_BUCKETS.map((b) => prisma.product.count({ where: { AND: [base, priceBucketWhere(b.key)] } })),
  );
  return PRICE_BUCKETS.map((b, i) => ({ key: b.key, count: counts[i] }));
}

export const getShopCategory = cache((slug: string) =>
  prisma.category.findFirst({
    where: { slug, status: "ACTIVE" },
    select: { id: true, slug: true, nameTH: true, nameEN: true, descriptionTH: true, descriptionEN: true },
  }),
);

export const getShopFolder = cache((slug: string) =>
  prisma.folder.findFirst({
    where: { slug, status: "ACTIVE" },
    select: { id: true, slug: true, nameTH: true, nameEN: true },
  }),
);

/** Active folders that currently list at least one product (chips in the "All" view). */
export async function listShopFolders(now: Date = new Date()) {
  const folders = await prisma.folder.findMany({
    where: { status: "ACTIVE", products: { some: listedProductWhere(now) } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { slug: true, nameTH: true, nameEN: true },
  });
  return folders;
}

/** Cards per folder section on /shop; the rest is behind "view all" (?folder=slug). */
export const FOLDER_SECTION_SIZE = 8;

const FOLDER_ORDER = [{ folderSortOrder: "asc" }, { id: "desc" }] satisfies Prisma.ProductOrderByWithRelationInput[];

export type FolderSection = {
  /** null = products without a folder ("Other"), always last. */
  slug: string | null;
  name: string | null;
  total: number;
  items: ProductCardData[];
};

/**
 * /shop "By folder" view: active folders in admin order, each with its first listed products
 * in admin drag order, then unfiled products. Empty sections are dropped. Products in archived
 * folders appear only in the flat "All" view.
 */
export async function listShopFolderSections(
  locale: string,
  now: Date = new Date(),
  userId: string | null = null,
): Promise<FolderSection[]> {
  const listed = listedProductWhere(now);
  const [folders, unfiledTotal, unfiled] = await prisma.$transaction([
    prisma.folder.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        slug: true,
        nameTH: true,
        nameEN: true,
        _count: { select: { products: { where: listed } } },
        products: { where: listed, orderBy: FOLDER_ORDER, take: FOLDER_SECTION_SIZE, select: cardSelect(userId, now) },
      },
    }),
    prisma.product.count({ where: { AND: [listed, { folderId: null }] } }),
    prisma.product.findMany({
      where: { AND: [listed, { folderId: null }] },
      orderBy: shopOrderBy("newest", locale),
      take: FOLDER_SECTION_SIZE,
      select: cardSelect(userId, now),
    }),
  ]);

  const sections: FolderSection[] = folders.map((f) => ({
    slug: f.slug,
    name: localized(locale, f.nameTH, f.nameEN),
    total: f._count.products,
    items: f.products.map((r) => toCard(r, locale, now)),
  }));
  sections.push({ slug: null, name: null, total: unfiledTotal, items: unfiled.map((r) => toCard(r, locale, now)) });
  return sections.filter((s) => s.total > 0);
}

/**
 * Published product for the detail page (any sale state, so ended products still resolve).
 * Cached per request so generateMetadata and the page share one query.
 */
export const getShopProduct = cache((slug: string) =>
  prisma.product.findFirst({
    where: { slug, publishStatus: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      nameTH: true,
      nameEN: true,
      descriptionTH: true,
      descriptionEN: true,
      price: true,
      discountPercent: true,
      discountStartAt: true,
      discountEndAt: true,
      publishStatus: true,
      saleStartAt: true,
      saleEndAt: true,
      softwareTags: {
        select: { softwareTag: { select: { name: true } } },
        orderBy: { softwareTag: { sortOrder: "asc" } },
      },
      supportedVersion: true,
      fileFormat: true,
      license: true,
      requirementsTH: true,
      requirementsEN: true,
      downloadLimit: true,
      stockLimit: true,
      seoTitleTH: true,
      seoTitleEN: true,
      metaDescriptionTH: true,
      metaDescriptionEN: true,
      updatedAt: true,
      ratingCount: true,
      ratingSum: true,
      categoryId: true,
      category: { select: { slug: true, nameTH: true, nameEN: true, status: true } },
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, imagePath: true, altTextTH: true, altTextEN: true },
      },
      versions: {
        orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          versionNumber: true,
          releaseDate: true,
          releaseNotesTH: true,
          releaseNotesEN: true,
          isLatest: true,
          createdAt: true,
          // Display metadata only — storagePath stays server-side.
          files: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              fileName: true,
              fileSize: true,
              fileType: true,
              variant: { select: { nameTH: true, nameEN: true } },
            },
          },
        },
      },
    },
  }),
);

export type ShopProduct = NonNullable<Awaited<ReturnType<typeof getShopProduct>>>;

/**
 * Versions customers can see: the latest and anything created before it. A newer version
 * that the admin has not yet set as latest is still being prepared and stays hidden.
 */
export function releasedVersions(versions: ShopProduct["versions"]) {
  const latest = versions.find((v) => v.isLatest);
  if (!latest) return [];
  return versions.filter((v) => v.isLatest || v.createdAt <= latest.createdAt);
}

export function listSitemapProducts() {
  return prisma.product.findMany({
    where: { publishStatus: "PUBLISHED", category: { status: "ACTIVE" } },
    orderBy: { id: "asc" },
    take: 5000,
    select: { slug: true, updatedAt: true },
  });
}

/** Units held by open or completed orders (also shown to the admin next to the stock field). */
export function countStockTaken(productId: string, now: Date): Promise<number> {
  return prisma.orderItem.count({ where: { productId, variantId: null, order: stockTakingOrderWhere(now) } });
}
