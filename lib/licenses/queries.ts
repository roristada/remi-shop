import "server-only";
import { prisma } from "@/lib/prisma/client";
import { cancelExpiredOrders } from "@/lib/orders/ownership";
import type { LicenseOffer } from "@/lib/licenses/rules";

export const LICENSE_REQUESTS_PAGE_SIZE = 10;

/** Usage types this product offers right now (active types with a price), in the admin's order. */
export async function getLicenseOffers(productId: string): Promise<LicenseOffer[]> {
  const rows = await prisma.productLicensePrice.findMany({
    where: { productId, usageType: { isActive: true } },
    orderBy: [{ usageType: { sortOrder: "asc" } }, { usageType: { nameTH: "asc" } }],
    select: { usageTypeId: true, price: true, usageType: { select: { nameTH: true, nameEN: true } } },
  });
  return rows.map((r) => ({ usageTypeId: r.usageTypeId, price: r.price, nameTH: r.usageType.nameTH, nameEN: r.usageType.nameEN }));
}

/** Descriptions for the request form (not needed for pricing). */
export function getUsageTypeDescriptions(ids: string[]) {
  return prisma.licenseUsageType.findMany({
    where: { id: { in: ids } },
    select: { id: true, descriptionTH: true, descriptionEN: true },
  });
}

/** The caller's own requests, newest first. Ownership is part of the query. */
export async function listLicenseRequestsForUser(userId: string, page: number, now: Date = new Date()) {
  // Approved requests show their order's payment state, so expire unpaid orders first.
  await cancelExpiredOrders(userId, now);
  const where = { userId };
  const [total, items] = await prisma.$transaction([
    prisma.licenseRequest.count({ where }),
    prisma.licenseRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * LICENSE_REQUESTS_PAGE_SIZE,
      take: LICENSE_REQUESTS_PAGE_SIZE,
      select: {
        id: true,
        productNameTHSnapshot: true,
        productNameENSnapshot: true,
        buyerName: true,
        artistName: true,
        platform: true,
        total: true,
        status: true,
        rejectReason: true,
        reviewedAt: true,
        createdAt: true,
        product: { select: { slug: true } },
        items: { orderBy: { id: "asc" }, select: { id: true, nameTHSnapshot: true, nameENSnapshot: true, price: true } },
        order: { select: { orderNumber: true, status: true, expiresAt: true, paidAt: true } },
      },
    }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / LICENSE_REQUESTS_PAGE_SIZE)) };
}

export type CustomerLicenseRequest = Awaited<ReturnType<typeof listLicenseRequestsForUser>>["items"][number];

export async function getLicensePaymentDays(): Promise<number> {
  const s = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { licensePaymentDays: true } });
  return s?.licensePaymentDays ?? 3;
}
