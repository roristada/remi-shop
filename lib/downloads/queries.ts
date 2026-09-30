import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lineKey } from "@/lib/orders/rules";
import { canAccessFile, isDownloadLimitReached, isWithinRateLimit } from "@/lib/downloads/rules";

export type DownloadAccess =
  | { ok: true; orderId: string; productId: string; storagePath: string; fileName: string; skipLog: boolean }
  | { ok: false; code: "not_found" | "forbidden" | "limit_reached" };

/**
 * Server-side authorization for one file: ownership (a COMPLETED, PRODUCT-kind order containing
 * this file's product, and for a variant file that variant) plus the per-file download limit. A click inside the rate-limit window
 * re-issues the same file without counting again (`skipLog`), so double-clicks and refreshes
 * don't burn through the limit.
 */
export async function checkDownloadAccess(userId: string, fileId: string, now: Date): Promise<DownloadAccess> {
  const file = await prisma.productVersionFile.findUnique({
    where: { id: fileId },
    select: {
      storagePath: true,
      fileName: true,
      variantId: true,
      version: { select: { productId: true, product: { select: { downloadLimit: true } } } },
    },
  });
  if (!file) return { ok: false, code: "not_found" };
  const productId = file.version.productId;

  const ownedLines = await prisma.orderItem.findMany({
    where: { productId, order: { userId, status: "COMPLETED", kind: "PRODUCT" } },
    select: { orderId: true, variantId: true },
    orderBy: { order: { paidAt: "desc" } },
  });
  if (!canAccessFile(file.variantId, new Set(ownedLines.map((l) => l.variantId)))) return { ok: false, code: "forbidden" };
  // The download is logged against the order that granted this file.
  const orderItem = ownedLines.find((l) => file.variantId === null || l.variantId === file.variantId) ?? ownedLines[0];

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

const VERSIONS_SELECT = {
  orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
  select: {
    id: true,
    versionNumber: true,
    isLatest: true,
    createdAt: true,
    files: {
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, fileName: true, fileSize: true, fileType: true, variantId: true },
    },
  },
} satisfies Prisma.Product$versionsArgs;

type VersionRow = Prisma.ProductVersionGetPayload<typeof VERSIONS_SELECT>;

async function downloadCounts(userId: string, versions: VersionRow[]): Promise<Map<string, number>> {
  const fileIds = versions.flatMap((v) => v.files.map((f) => f.id));
  if (fileIds.length === 0) return new Map();
  const counts = await prisma.download.groupBy({
    by: ["fileId"],
    where: { userId, fileId: { in: fileIds } },
    _count: { _all: true },
  });
  const out = new Map<string, number>();
  for (const c of counts) if (c.fileId) out.set(c.fileId, c._count._all);
  return out;
}

/**
 * Versions with files this buyer may get (see canAccessFile), each file with how often this
 * customer has downloaded it. The download route re-checks access on every click.
 */
function toDownloadVersions(
  versions: VersionRow[],
  countByFile: Map<string, number>,
  ownedVariants: ReadonlySet<string | null>,
) {
  return versions
    .map((v) => ({ ...v, files: v.files.filter((f) => canAccessFile(f.variantId, ownedVariants)) }))
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
    }));
}

export type DownloadVersion = ReturnType<typeof toDownloadVersions>[number];

/**
 * Downloadable files for the lines of one of the caller's COMPLETED product orders, keyed
 * by lineKey(productId, variantId). Ownership is part of the query; the download route re-authorizes every click.
 */
export async function listOrderDownloads(userId: string, orderId: string) {
  const items = await prisma.orderItem.findMany({
    where: { orderId, order: { userId, status: "COMPLETED", kind: "PRODUCT" } },
    select: { variantId: true, product: { select: { id: true, downloadLimit: true, versions: VERSIONS_SELECT } } },
  });
  const countByFile = await downloadCounts(userId, items.flatMap((i) => i.product.versions));
  // Each line shows what it grants: the shared files plus, for a variant line, that variant's.
  return new Map(
    items.map((i) => [
      lineKey(i.product.id, i.variantId),
      {
        downloadLimit: i.product.downloadLimit,
        versions: toDownloadVersions(i.product.versions, countByFile, new Set([i.variantId])),
      },
    ]),
  );
}

export async function listOwnedProducts(userId: string, page: number) {
  const where = { order: { userId, status: "COMPLETED" as const, kind: "PRODUCT" as const } };
  const rows = await prisma.orderItem.findMany({
    where,
    select: {
      orderId: true,
      productId: true,
      variantId: true,
      variantNameTHSnapshot: true,
      variantNameENSnapshot: true,
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
          versions: VERSIONS_SELECT,
        },
      },
    },
    orderBy: { order: { createdAt: "desc" } },
  });

  // One row per product; a customer may own several of its variants, whose files are combined.
  const byProduct = new Map<string, (typeof rows)[number]>();
  const ownedVariants = new Map<string, Set<string | null>>();
  const variantNames = new Map<string, { th: string; en: string }[]>();
  for (const r of rows) {
    if (!byProduct.has(r.productId)) byProduct.set(r.productId, r);
    const owned = ownedVariants.get(r.productId) ?? new Set();
    owned.add(r.variantId);
    ownedVariants.set(r.productId, owned);
    if (r.variantNameTHSnapshot && r.variantNameENSnapshot) {
      const names = variantNames.get(r.productId) ?? [];
      names.push({ th: r.variantNameTHSnapshot, en: r.variantNameENSnapshot });
      variantNames.set(r.productId, names);
    }
  }
  const deduped = [...byProduct.values()];

  const total = deduped.length;
  const pageCount = Math.max(1, Math.ceil(total / DOWNLOADS_PAGE_SIZE));
  const pageRows = deduped.slice((page - 1) * DOWNLOADS_PAGE_SIZE, page * DOWNLOADS_PAGE_SIZE);

  const countByFile = await downloadCounts(userId, pageRows.flatMap((r) => r.product.versions));

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
      variantNames: variantNames.get(r.productId) ?? [],
      versions: toDownloadVersions(r.product.versions, countByFile, ownedVariants.get(r.productId) ?? new Set()),
    })),
    total,
    pageCount,
  };
}

export type OwnedProduct = Awaited<ReturnType<typeof listOwnedProducts>>["items"][number];
