import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { LicenseRequestStatus, Prisma } from "@/lib/generated/prisma/client";
import { BUCKETS } from "@/lib/storage/buckets";
import { createSignedViewUrls } from "@/lib/storage/payment-storage";

export const LICENSE_TABS = {
  pending: { label: "รอพิจารณา", statuses: ["PENDING_REVIEW"] },
  approved: { label: "อนุมัติแล้ว", statuses: ["APPROVED"] },
  closed: { label: "ปฏิเสธ / ยกเลิก", statuses: ["REJECTED", "CANCELLED"] },
} as const satisfies Record<string, { label: string; statuses: LicenseRequestStatus[] }>;

export type LicenseTab = keyof typeof LICENSE_TABS;
export const LICENSE_REVIEW_PAGE_SIZE = 10;

export async function listLicenseRequestsForReview(tab: LicenseTab, page: number) {
  const where: Prisma.LicenseRequestWhereInput = { status: { in: [...LICENSE_TABS[tab].statuses] } };
  const [total, rows, pendingCount] = await prisma.$transaction([
    prisma.licenseRequest.count({ where }),
    prisma.licenseRequest.findMany({
      where,
      // Pending: oldest first (first come, first served). Others: most recent first.
      orderBy: tab === "pending" ? { createdAt: "asc" } : { updatedAt: "desc" },
      skip: (page - 1) * LICENSE_REVIEW_PAGE_SIZE,
      take: LICENSE_REVIEW_PAGE_SIZE,
      select: {
        id: true,
        productNameTHSnapshot: true,
        buyerName: true,
        buyerEmail: true,
        buyerContact: true,
        artistName: true,
        artistContact: true,
        platform: true,
        note: true,
        artworkPath: true,
        total: true,
        status: true,
        rejectReason: true,
        reviewedAt: true,
        cancelledAt: true,
        createdAt: true,
        reviewedBy: { select: { email: true, displayName: true } },
        user: { select: { email: true, displayName: true } },
        product: { select: { id: true } },
        items: { orderBy: { id: "asc" }, select: { id: true, nameTHSnapshot: true, price: true } },
        order: { select: { orderNumber: true, status: true, expiresAt: true } },
      },
    }),
    prisma.licenseRequest.count({ where: { status: "PENDING_REVIEW" } }),
  ]);

  // Artwork lives in a private bucket: short-lived signed URLs, generated per page view.
  const urls = await createSignedViewUrls(
    BUCKETS.licenseArtworks,
    rows.map((r) => r.artworkPath),
  );
  const items = rows.map((r) => ({ ...r, artworkUrl: urls.get(r.artworkPath) ?? null }));
  return { items, total, pendingCount, pageCount: Math.max(1, Math.ceil(total / LICENSE_REVIEW_PAGE_SIZE)) };
}

export type ReviewLicenseRequest = Awaited<ReturnType<typeof listLicenseRequestsForReview>>["items"][number];

export function listUsageTypes() {
  return prisma.licenseUsageType.findMany({
    orderBy: [{ sortOrder: "asc" }, { nameTH: "asc" }],
    include: { _count: { select: { prices: true, requestItems: true } } },
  });
}

/** Every usage type with this product's price for it (null = not offered). */
export async function getProductLicensePricing(productId: string) {
  const [types, prices] = await Promise.all([
    prisma.licenseUsageType.findMany({
      orderBy: [{ sortOrder: "asc" }, { nameTH: "asc" }],
      select: { id: true, nameTH: true, nameEN: true, isActive: true },
    }),
    prisma.productLicensePrice.findMany({ where: { productId }, select: { usageTypeId: true, price: true } }),
  ]);
  const priceById = new Map(prices.map((p) => [p.usageTypeId, p.price.toString()]));
  return types.map((t) => ({ ...t, price: priceById.get(t.id) ?? null }));
}
