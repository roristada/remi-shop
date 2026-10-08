import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma, PublishStatus } from "@/lib/generated/prisma/client";
import { stockTakingOrderWhere } from "@/lib/products/stock";
import { adminProductOrderBy, type AdminProductSort } from "@/lib/products/admin-sort";
import { productNeedsEmailWhere } from "@/lib/products/delivery";

export const ADMIN_PAGE_SIZE = 20;

export type AdminProductFilters = {
  q?: string;
  categoryId?: string;
  publishStatus?: PublishStatus;
  /** A folder id, or "none" for products in no folder. */
  folder?: string;
  /** "email": products with a line that has no file yet (the store emails it). */
  delivery?: "email";
  sort: AdminProductSort;
  page: number;
};

export async function listAdminProducts({ q, categoryId, publishStatus, folder, delivery, sort, page }: AdminProductFilters) {
  const where: Prisma.ProductWhereInput = {
    ...(categoryId ? { categoryId } : {}),
    ...(folder ? { folderId: folder === "none" ? null : folder } : {}),
    ...(publishStatus ? { publishStatus } : {}),
    // Both this and the search use OR, so this one is nested under AND.
    ...(delivery === "email" ? { AND: [productNeedsEmailWhere()] } : {}),
    ...(q
      ? {
          OR: [
            { nameTH: { contains: q, mode: "insensitive" } },
            { nameEN: { contains: q, mode: "insensitive" } },
            { slug: { contains: q.toLowerCase() } },
          ],
        }
      : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: adminProductOrderBy(sort),
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
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
        updatedAt: true,
        category: { select: { nameTH: true } },
        folder: { select: { id: true, nameTH: true } },
        images: { where: { isPrimary: true }, select: { imagePath: true, cardPath: true, altTextTH: true }, take: 1 },
        versions: { where: { isLatest: true }, select: { files: { select: { variantId: true } } }, take: 1 },
        variants: { where: { isActive: true }, select: { id: true } },
        stockLimit: true,
        _count: { select: { orderItems: true, variants: true } },
      },
    }),
  ]);

  // Units taken per limited product (the product's own line, open + completed orders), in one query.
  const limitedIds = items.filter((p) => p.stockLimit !== null).map((p) => p.id);
  const taken =
    limitedIds.length > 0
      ? await prisma.orderItem.groupBy({
          by: ["productId"],
          where: { productId: { in: limitedIds }, variantId: null, order: stockTakingOrderWhere(new Date()) },
          _count: { _all: true },
        })
      : [];
  const takenById = new Map(taken.map((t) => [t.productId, t._count._all]));

  return {
    items: items.map((p) => ({ ...p, stockTaken: takenById.get(p.id) ?? 0 })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}

export function getAdminProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, nameTH: true } },
      images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      softwareTags: { select: { softwareTagId: true } },
      versions: {
        orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
        include: { files: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      },
      variants: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          // orderItems = units taken now (open + completed orders), shown next to the stock.
          _count: { select: { orderItems: { where: { order: stockTakingOrderWhere(new Date()) } }, files: true } },
        },
      },
    },
  });
}

export type AdminProduct = NonNullable<Awaited<ReturnType<typeof getAdminProduct>>>;

export function listCategoryOptions() {
  return prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { nameTH: "asc" }],
    select: { id: true, nameTH: true, status: true },
  });
}

/** Customers who completed a purchase of this product (affected by file changes). */
export function countProductBuyers(productId: string) {
  return prisma.orderItem.count({ where: { productId, order: { status: "COMPLETED" } } });
}

export function listAdminCategories() {
  return prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { nameTH: "asc" }],
    include: { _count: { select: { products: true } } },
  });
}

/** Any order (paid or not) blocks hard delete via FK Restrict. */
export function countProductOrders(productId: string) {
  return prisma.orderItem.count({ where: { productId } });
}

/** Folders for the product list's sidebar, with how many products each holds (and how many have none). */
export async function listFolderCounts() {
  const [folders, counts] = await prisma.$transaction([
    prisma.folder.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, nameTH: true, status: true },
    }),
    prisma.product.groupBy({ by: ["folderId"], orderBy: { folderId: "asc" }, _count: { _all: true } }),
  ]);
  const byFolder = new Map(counts.map((c) => [c.folderId, typeof c._count === "object" ? (c._count._all ?? 0) : 0]));
  return {
    folders: folders.map((f) => ({ ...f, count: byFolder.get(f.id) ?? 0 })),
    unfiled: byFolder.get(null) ?? 0,
  };
}

export function listFolderOptions() {
  return prisma.folder.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, nameTH: true },
  });
}
