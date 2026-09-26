import type { Prisma } from "@/lib/generated/prisma/client";
import type { ProductStatus } from "@/lib/products/status";
import { SLUG_PATTERN } from "@/lib/validation/product";

export const SHOP_PAGE_SIZE = 12;
export const SHOP_SORTS = ["newest", "price-asc", "price-desc", "name"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export type ShopFilters = {
  q?: string;
  /** Category slug (validated format only; existence is checked by the query). */
  category?: string;
  /** Folder slug (validated format only; existence is checked by the query). */
  folder?: string;
  sort: ShopSort;
  /** Only products with a discount active right now. */
  sale: boolean;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

function slugParam(v: string | string[] | undefined) {
  const slug = one(v)?.trim().toLowerCase();
  return slug && slug.length <= 100 && SLUG_PATTERN.test(slug) ? slug : undefined;
}

/** URL search params → safe filters. Anything invalid falls back to "no filter". */
export function parseShopFilters(sp: SearchParams): ShopFilters {
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const sort = SHOP_SORTS.find((s) => s === one(sp.sort)) ?? "newest";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  return {
    q,
    category: slugParam(sp.category),
    folder: slugParam(sp.folder),
    sort,
    sale: one(sp.sale) === "1",
    page,
  };
}

/** Filters → query-string params (defaults omitted, `page` excluded). */
export function shopFilterParams(f: ShopFilters): Record<string, string | undefined> {
  return {
    q: f.q,
    category: f.category,
    folder: f.folder,
    sort: f.sort === "newest" ? undefined : f.sort,
    sale: f.sale ? "1" : undefined,
  };
}

/** Any filter set means the flat grid; otherwise /shop shows folder sections. */
export function hasShopFilters(f: ShopFilters): boolean {
  return Boolean(f.q || f.category || f.folder || f.sale || f.sort !== "newest" || f.page > 1);
}

/**
 * Products shown in storefront listings: published, in a visible category, and not past
 * their sale end. Scheduled products are listed (as "coming soon"); ended ones are not,
 * but their detail page stays reachable.
 */
export function listedProductWhere(now: Date): Prisma.ProductWhereInput {
  return {
    publishStatus: "PUBLISHED",
    category: { status: "ACTIVE" },
    OR: [{ saleEndAt: null }, { saleEndAt: { gt: now } }],
  };
}

/** Mirrors isDiscountActive(): percent set and discountStartAt <= now <= discountEndAt. */
export function activeDiscountWhere(now: Date): Prisma.ProductWhereInput {
  return {
    discountPercent: { gt: 0 },
    discountStartAt: { lte: now },
    discountEndAt: { gte: now },
  };
}

export function shopSearchWhere(q: string): Prisma.ProductWhereInput {
  return {
    OR: [
      { nameTH: { contains: q, mode: "insensitive" } },
      { nameEN: { contains: q, mode: "insensitive" } },
      { software: { contains: q, mode: "insensitive" } },
      { fileFormat: { contains: q, mode: "insensitive" } },
    ],
  };
}

/**
 * Price sorts use the base price; a discount active right now is not reflected in the order.
 * The displayed price is always the server-calculated current price.
 */
export function shopOrderBy(sort: ShopSort, locale: string): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ price: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ price: "desc" }, { id: "asc" }];
    case "name":
      return [locale === "en" ? { nameEN: "asc" } : { nameTH: "asc" }, { id: "asc" }];
    case "newest":
      return [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }];
  }
}

/** schema.org availability for Product JSON-LD. */
export function schemaAvailability(status: ProductStatus): string {
  if (status === "ACTIVE") return "https://schema.org/InStock";
  if (status === "SCHEDULED") return "https://schema.org/PreOrder";
  return "https://schema.org/Discontinued";
}
