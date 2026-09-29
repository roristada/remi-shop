import "server-only";
import { prisma } from "@/lib/prisma/client";
import { isDownloadLimitReached, isWithinRateLimit } from "@/lib/downloads/rules";

export type DownloadAccess =
  | { ok: true; orderId: string; productId: string; storagePath: string; fileName: string; skipLog: boolean }
  | { ok: false; code: "not_found" | "forbidden" | "limit_reached" };

/**
 * Server-side authorization for one file: ownership (a COMPLETED, PRODUCT-kind order containing
 * this file's product) plus the per-file download limit. A click inside the rate-limit window
 * re-issues the same file without counting again (`skipLog`), so double-clicks and refreshes
 * don't burn through the limit.
 */
export async function checkDownloadAccess(userId: string, fileId: string, now: Date): Promise<DownloadAccess> {
  const file = await prisma.productVersionFile.findUnique({
    where: { id: fileId },
    select: {
      storagePath: true,
      fileName: true,
      version: { select: { productId: true, product: { select: { downloadLimit: true } } } },
    },
  });
  if (!file) return { ok: false, code: "not_found" };
  const productId = file.version.productId;

  const orderItem = await prisma.orderItem.findFirst({
    where: { productId, order: { userId, status: "COMPLETED", kind: "PRODUCT" } },
    select: { orderId: true },
    orderBy: { order: { paidAt: "desc" } },
  });
  if (!orderItem) return { ok: false, code: "forbidden" };

  const [count, last] = await Promise.all([
    prisma.download.count({ where: { userId, fileId } }),
    prisma.download.findFirst({ where: { userId, fileId }, orderBy: { downloadedAt: "desc" }, select: { downloadedAt: true } }),
  ]);
  const skipLog = isWithinRateLimit(last?.downloadedAt ?? null, now);
  if (!skipLog && isDownloadLimitReached(file.version.product.downloadLimit, count)) {
    return { ok: false, code: "limit_reached" };
  }

  return { ok: true, orderId: orderItem.orderId, productId, storagePath: file.storagePath, fileName: file.fileName, skipLog };
}

export function recordDownload(params: { userId: string; orderId: string; productId: string; fileId: string }) {
  return prisma.download.create({ data: params });
}

/**
 * Products this customer has fully paid for (personal purchases only — a LICENSE-kind order
 * never grants file access). Kept regardless of the product's current publish/category status:
 * a completed purchase's file access never depends on whether the product is still on sale.
 */
export const DOWNLOADS_PAGE_SIZE = 10;

export async function listOwnedProducts(userId: string, page: number) {
  const where = { order: { userId, status: "COMPLETED" as const, kind: "PRODUCT" as const } };
  const rows = await prisma.orderItem.findMany({
    where,
    select: {
      orderId: true,
      productId: true,
      order: { select: { paidAt: true, createdAt: true } },
      product: {
        select: {
          id: true,
          slug: true,
          nameTH: true,
          nameEN: true,
          downloadLimit: true,
          category: { select: { nameTH: true, nameEN: true } },
          images: {
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            take: 1,
            select: { imagePath: true, altTextTH: true, altTextEN: true },
          },
          versions: {
            orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              versionNumber: true,
              isLatest: true,
              createdAt: true,
              files: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                select: { id: true, fileName: true, fileSize: true, fileType: true },
              },
            },
          },
        },
      },
    },
    orderBy: { order: { createdAt: "desc" } },
  });

  // One row per product: a customer can't rebuy an owned product, but dedupe defensively anyway.
  const byProduct = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!byProduct.has(r.productId)) byProduct.set(r.productId, r);
  const deduped = [...byProduct.values()];

  const total = deduped.length;
  const pageCount = Math.max(1, Math.ceil(total / DOWNLOADS_PAGE_SIZE));
  const pageRows = deduped.slice((page - 1) * DOWNLOADS_PAGE_SIZE, page * DOWNLOADS_PAGE_SIZE);

  const fileIds = pageRows.flatMap((r) => r.product.versions.flatMap((v) => v.files.map((f) => f.id)));
  const counts =
    fileIds.length > 0
      ? await prisma.download.groupBy({ by: ["fileId"], where: { userId, fileId: { in: fileIds } }, _count: { _all: true } })
      : [];
  const countByFile = new Map(counts.map((c) => [c.fileId, c._count._all]));

  return {
    items: pageRows.map((r) => ({
      productId: r.product.id,
      slug: r.product.slug,
      nameTH: r.product.nameTH,
      nameEN: r.product.nameEN,
      categoryNameTH: r.product.category.nameTH,
      categoryNameEN: r.product.category.nameEN,
      image: r.product.images[0] ?? null,
      downloadLimit: r.product.downloadLimit,
      versions: r.product.versions
        .filter((v) => v.files.length > 0)
        .map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          isLatest: v.isLatest,
          files: v.files.map((f) => ({
            id: f.id,
            fileName: f.fileName,
            fileSize: f.fileSize,
            fileType: f.fileType,
            downloadCount: countByFile.get(f.id) ?? 0,
          })),
        })),
    })),
    total,
    pageCount,
  };
}

export type OwnedProduct = Awaited<ReturnType<typeof listOwnedProducts>>["items"][number];
