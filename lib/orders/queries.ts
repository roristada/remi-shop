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
          productVersionSnapshot: true,
          unitPrice: true,
          discount: true,
          finalPrice: true,
          product: { select: { slug: true } },
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
