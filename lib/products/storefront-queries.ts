import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { localized } from "@/i18n/localize";
import { calculateProductPrice, type ProductPrice } from "@/lib/pricing/calculate";
import { getProductStatus, type ProductStatus } from "@/lib/products/status";
import { previewImageUrl } from "@/lib/storage/public-url";
import {
  activeDiscountWhere,
  listedProductWhere,
  SHOP_PAGE_SIZE,
  shopOrderBy,
  shopSearchWhere,
  type ShopFilters,
} from "@/lib/products/storefront";

// Storefront reads only. Never select storage paths of digital files here.

const CARD_SELECT = {
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
  software: true,
  category: { select: { slug: true, nameTH: true, nameEN: true } },
  images: {
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
    select: { imagePath: true, altTextTH: true, altTextEN: true },
  },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof CARD_SELECT }>;

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  software: string | null;
  image: { url: string; alt: string } | null;
  price: ProductPrice;
  status: ProductStatus;
};

function toCard(row: CardRow, locale: string, now: Date): ProductCardData {
  const name = localized(locale, row.nameTH, row.nameEN);
  const image = row.images[0];
  return {
    id: row.id,
    slug: row.slug,
    name,
    categoryName: localized(locale, row.category.nameTH, row.category.nameEN),
    software: row.software,
    image: image
      ? { url: previewImageUrl(image.imagePath), alt: localized(locale, image.altTextTH, image.altTextEN) || name }
      : null,
    price: calculateProductPrice(row, now),
    status: getProductStatus(row, now),
  };
}

export async function listShopProducts(
  filters: ShopFilters & { categoryId?: string; folderId?: string },
  locale: string,
  now: Date = new Date(),
) {
  const and: Prisma.ProductWhereInput[] = [listedProductWhere(now)];
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.folderId) and.push({ folderId: filters.folderId });
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
      select: CARD_SELECT,
    }),
  ]);

  return {
    items: rows.map((r) => toCard(r, locale, now)),
    total,
    pageCount: Math.max(1, Math.ceil(total / SHOP_PAGE_SIZE)),
  };
}

export async function listNewestProducts(locale: string, take = 8, now: Date = new Date()) {
  const rows = await prisma.product.findMany({
    where: listedProductWhere(now),
    orderBy: shopOrderBy("newest", locale),
    take,
    select: CARD_SELECT,
  });
  return rows.map((r) => toCard(r, locale, now));
}

export async function listRelatedProducts(
  categoryId: string,
  excludeId: string,
  locale: string,
  now: Date = new Date(),
  take = 4,
) {
  const rows = await prisma.product.findMany({
    where: { AND: [listedProductWhere(now), { categoryId, id: { not: excludeId } }] },
    orderBy: shopOrderBy("newest", locale),
    take,
    select: CARD_SELECT,
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

/** Visible categories with the number of currently listed products. */
export function listShopCategories(now: Date = new Date()) {
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
      _count: { select: { products: { where: listedProductWhere(now) } } },
    },
  });
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
export async function listShopFolderSections(locale: string, now: Date = new Date()): Promise<FolderSection[]> {
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
        products: { where: listed, orderBy: FOLDER_ORDER, take: FOLDER_SECTION_SIZE, select: CARD_SELECT },
      },
    }),
    prisma.product.count({ where: { AND: [listed, { folderId: null }] } }),
    prisma.product.findMany({
      where: { AND: [listed, { folderId: null }] },
      orderBy: shopOrderBy("newest", locale),
      take: FOLDER_SECTION_SIZE,
      select: CARD_SELECT,
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
      software: true,
      supportedVersion: true,
      fileFormat: true,
      license: true,
      requirementsTH: true,
      requirementsEN: true,
      downloadLimit: true,
      seoTitleTH: true,
      seoTitleEN: true,
      metaDescriptionTH: true,
      metaDescriptionEN: true,
      updatedAt: true,
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
            select: { id: true, fileName: true, fileSize: true, fileType: true },
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
