import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma, PublishStatus } from "@/lib/generated/prisma/client";

export const ADMIN_PAGE_SIZE = 20;

export type AdminProductFilters = {
  q?: string;
  categoryId?: string;
  publishStatus?: PublishStatus;
  page: number;
};

export async function listAdminProducts({ q, categoryId, publishStatus, page }: AdminProductFilters) {
  const where: Prisma.ProductWhereInput = {
    ...(categoryId ? { categoryId } : {}),
    ...(publishStatus ? { publishStatus } : {}),
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
      orderBy: { updatedAt: "desc" },
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
        images: { where: { isPrimary: true }, select: { imagePath: true, altTextTH: true }, take: 1 },
        versions: { where: { isLatest: true }, select: { versionNumber: true }, take: 1 },
      },
    }),
  ]);

  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
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
