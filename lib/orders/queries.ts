import "server-only";
import { prisma } from "@/lib/prisma/client";
import { cancelExpiredOrders } from "@/lib/orders/ownership";

export const ORDERS_PAGE_SIZE = 10;

/** The caller's own order, or null. Ownership is part of the query, never checked afterwards. */
export async function getOrderForUser(userId: string, orderNumber: string, now: Date = new Date()) {
  await cancelExpiredOrders(userId, now);
  return prisma.order.findFirst({
    where: { orderNumber, userId },
    select: {
      id: true,
      orderNumber: true,
      kind: true,
      status: true,
      paymentStatus: true,
      subtotal: true,
      discount: true,
      total: true,
      expiresAt: true,
      createdAt: true,
      cancelledAt: true,
      paidAt: true,
      // Latest slip only: its state and reject reason drive the payment panel.
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, rejectReason: true, slipPath: true, createdAt: true },
      },
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productNameTHSnapshot: true,
          productNameENSnapshot: true,
          variantId: true,
          variantNameTHSnapshot: true,
          variantNameENSnapshot: true,
          unitPrice: true,
          discount: true,
          finalPrice: true,
          product: {
            select: {
              id: true,
              slug: true,
              images: {
                orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                take: 1,
                select: { imagePath: true, cardPath: true, altTextTH: true, altTextEN: true },
              },
              // Whether the line has a file to download yet; without one the store emails it.
              versions: { where: { isLatest: true }, take: 1, select: { files: { select: { variantId: true } } } },
            },
          },
        },
      },
      // LICENSE orders have no items; the approved request describes what is being paid for.
      licenseRequest: {
        select: {
          productNameTHSnapshot: true,
          productNameENSnapshot: true,
          artistName: true,
          platform: true,
          product: { select: { slug: true } },
          items: { orderBy: { id: "asc" }, select: { id: true, nameTHSnapshot: true, nameENSnapshot: true, price: true } },
        },
      },
    },
  });
}

export type CustomerOrder = NonNullable<Awaited<ReturnType<typeof getOrderForUser>>>;

export async function listOrdersForUser(userId: string, page: number, now: Date = new Date()) {
  await cancelExpiredOrders(userId, now);
  const where = { userId };
  const [total, items] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        kind: true,
        status: true,
        total: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)) };
}

/** Store payment details shown to signed-in customers on unpaid orders. */
export function getPaymentSettings() {
  return prisma.paymentSetting.findUnique({
    where: { id: 1 },
    select: { promptPayName: true, promptPayNumber: true, qrImagePath: true, instructionsTH: true, instructionsEN: true },
  });
}

/** Minutes a new order stays open for payment (store setting, 60 by default). */
/** Every preview image of the products in an order, for the order page's gallery mode. */
export async function listOrderGalleryImages(productIds: string[]) {
  if (productIds.length === 0) return [];
  return prisma.productImage.findMany({
    where: { productId: { in: productIds } },
    orderBy: [{ productId: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, productId: true, imagePath: true, detailPath: true, altTextTH: true, altTextEN: true },
  });
}

export async function getOrderExpiryMinutes(): Promise<number> {
  const s = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { orderExpiryMinutes: true } });
  return s?.orderExpiryMinutes ?? 60;
}
