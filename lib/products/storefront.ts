import type { Prisma } from "@/lib/generated/prisma/client";
import type { ProductStatus } from "@/lib/products/status";
import { SLUG_PATTERN } from "@/lib/validation/product";

export const SHOP_PAGE_SIZE = 12;
export const SHOP_SORTS = ["newest", "price-asc", "price-desc", "name"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

/** Fixed THB buckets on the base list price (matches how price sorting already works). */
export const PRICE_BUCKETS = [
  { key: "under-100", min: undefined, max: 100 },
  { key: "100-300", min: 100, max: 300 },
  { key: "300-500", min: 300, max: 500 },
  { key: "500-1000", min: 500, max: 1000 },
  { key: "over-1000", min: 1000, max: undefined },
] as const satisfies { key: string; min: number | undefined; max: number | undefined }[];
export type PriceBucketKey = (typeof PRICE_BUCKETS)[number]["key"];

/** Caps how many slugs/ids one request can filter by — plenty for a real sidebar click, not a query-string abuse vector. */
const MAX_MULTI_FILTER = 20;

export type ShopFilters = {
  q?: string;
  /** Category slugs (validated format only; existence is checked by the query). */
  category: string[];
  /** Folder slug (validated format only; existence is checked by the query). */
  folder?: string;
  /** SoftwareTag ids. */
  software: string[];
  price?: PriceBucketKey;
  sort: ShopSort;
  /** Only products with a discount active right now. */
  sale: boolean;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

function many(v: string | string[] | undefined): string[] {
  return Array.isArray(v) ? v : v !== undefined ? [v] : [];
}

function slugParam(v: string | undefined) {
  const slug = v?.trim().toLowerCase();
  return slug && slug.length <= 100 && SLUG_PATTERN.test(slug) ? slug : undefined;
}

function slugParams(v: string | string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of many(v)) {
    const slug = slugParam(raw);
    if (slug) seen.add(slug);
    if (seen.size >= MAX_MULTI_FILTER) break;
  }
  return [...seen];
}

function idParams(v: string | string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of many(v)) {
    const id = raw?.trim();
    // Loose UUID shape check; the query layer treats a nonexistent id as "no match", not an error.
    if (id && /^[0-9a-f-]{36}$/i.test(id)) seen.add(id);
    if (seen.size >= MAX_MULTI_FILTER) break;
  }
  return [...seen];
}

/** URL search params → safe filters. Anything invalid falls back to "no filter". */
export function parseShopFilters(sp: SearchParams): ShopFilters {
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const sort = SHOP_SORTS.find((s) => s === one(sp.sort)) ?? "newest";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  const price = PRICE_BUCKETS.find((b) => b.key === one(sp.price))?.key;
  return {
    q,
    category: slugParams(sp.category),
    folder: slugParam(one(sp.folder)),
    software: idParams(sp.software),
    price,
    sort,
    sale: one(sp.sale) === "1",
    page,
  };
}

/** Filters → query-string params (defaults omitted, `page` excluded). Multi-value fields become arrays. */
export function shopFilterParams(f: ShopFilters): Record<string, string | string[] | undefined> {
  return {
    q: f.q,
    category: f.category.length > 0 ? f.category : undefined,
    folder: f.folder,
    software: f.software.length > 0 ? f.software : undefined,
    price: f.price,
    sort: f.sort === "newest" ? undefined : f.sort,
    sale: f.sale ? "1" : undefined,
  };
}

/** Any filter set means the flat grid; otherwise /shop shows folder sections. */
export function hasShopFilters(f: ShopFilters): boolean {
  return Boolean(
    f.q || f.category.length > 0 || f.folder || f.software.length > 0 || f.price || f.sale || f.sort !== "newest" || f.page > 1,
  );
}

export function priceBucketWhere(key: PriceBucketKey): Prisma.ProductWhereInput {
  const bucket = PRICE_BUCKETS.find((b) => b.key === key);
  if (!bucket) return {};
  return {
    price: {
      ...(bucket.min !== undefined ? { gte: bucket.min } : {}),
      ...(bucket.max !== undefined ? { lt: bucket.max } : {}),
    },
  };
}

/**
 * Products customers can browse (shop grid, category, search, folders, wishlist): published, in a
 * visible category, whatever the sale window. Cards badge the ones that can't be bought (ended,
 * sold out); purchase rules still reject them server-side. Drafts and hidden products
 * (DISABLED) never show.
 */
export function browsableProductWhere(): Prisma.ProductWhereInput {
  return {
    publishStatus: "PUBLISHED",
    category: { status: "ACTIVE" },
  };
}

/**
 * Products for promo rows (homepage, related, on-sale filter): published, in a visible category,
 * and not past their sale end. Scheduled products are included (as "coming soon").
 */
export function listedProductWhere(now: Date): Prisma.ProductWhereInput {
  return {
    publishStatus: "PUBLISHED",
    category: { status: "ACTIVE" },
    OR: [{ saleEndAt: null }, { saleEndAt: { gt: now } }],
  };
}

/** A discount running now: the product's own (products without variants) or any active variant's. */
export function activeDiscountWhere(now: Date): Prisma.ProductWhereInput {
  const running = { discountPercent: { gt: 0 }, discountStartAt: { lte: now }, discountEndAt: { gte: now } };
  return {
    OR: [
      { ...running, variants: { none: {} } },
      { variants: { some: { isActive: true, ...running } } },
    ],
  };
}

export function shopSearchWhere(q: string): Prisma.ProductWhereInput {
  return {
    OR: [
      { nameTH: { contains: q, mode: "insensitive" } },
      { nameEN: { contains: q, mode: "insensitive" } },
      { fileFormat: { contains: q, mode: "insensitive" } },
      { softwareTags: { some: { softwareTag: { name: { contains: q, mode: "insensitive" } } } } },
    ],
  };
}

/**
 * Base "still listed" where, plus search/on-sale — the filters every sidebar facet count shares.
 * Each facet's own count is computed independently of the *other* facet groups (picking a
 * software tag doesn't shrink the category counts and vice versa); this keeps three checkbox
 * groups fast and simple instead of a fully cross-filtered facet engine the catalog size doesn't need yet.
 */
export function facetBaseWhere(now: Date, filters: { q?: string; sale: boolean }): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [browsableProductWhere()];
  if (filters.q) and.push(shopSearchWhere(filters.q));
  // "On sale" means buyable at a discount, so closed and ended products drop out.
  if (filters.sale) and.push(listedProductWhere(now), activeDiscountWhere(now));
  return { AND: and };
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
export function schemaAvailability(status: ProductStatus, soldOut = false): string {
  if (status === "ACTIVE") return soldOut ? "https://schema.org/SoldOut" : "https://schema.org/InStock";
  if (status === "SCHEDULED") return "https://schema.org/PreOrder";
  return "https://schema.org/Discontinued";
}
