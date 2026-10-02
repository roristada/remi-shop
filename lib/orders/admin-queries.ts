import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { AdminOrderFilters } from "@/lib/orders/export";

export const ADMIN_ORDERS_PAGE_SIZE = 20;
/** Hard cap for one CSV download; narrow the date range for more. */
export const ORDER_EXPORT_LIMIT = 5000;

function orderWhere(f: AdminOrderFilters): Prisma.OrderWhereInput {
  return {
    ...(f.status ? { status: f.status } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.q
      ? {
          OR: [
            { orderNumber: { contains: f.q, mode: "insensitive" } },
            { user: { email: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

const ORDER_ROW_SELECT = {
  id: true,
  orderNumber: true,
  kind: true,
  status: true,
  total: true,
  createdAt: true,
  paidAt: true,
  user: { select: { email: true, displayName: true } },
  adminNote: { select: { body: true } },
  items: { orderBy: { id: "asc" }, select: { productNameTHSnapshot: true, variantNameTHSnapshot: true, finalPrice: true } },
  // LICENSE orders have no items; the request's usage types are what was paid for.
  licenseRequest: {
    select: {
      productNameTHSnapshot: true,
      items: { orderBy: { id: "asc" }, select: { nameTHSnapshot: true, price: true } },
    },
  },
} satisfies Prisma.OrderSelect;

export type AdminOrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_ROW_SELECT }>;

export async function listAdminOrders(f: AdminOrderFilters) {
  const where = orderWhere(f);
  const [total, rows] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * ADMIN_ORDERS_PAGE_SIZE,
      take: ADMIN_ORDERS_PAGE_SIZE,
      select: ORDER_ROW_SELECT,
    }),
  ]);
  return { rows, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_ORDERS_PAGE_SIZE)) };
}

/** Newest first, at most ORDER_EXPORT_LIMIT orders. */
export async function listOrdersForExport(f: AdminOrderFilters) {
  return prisma.order.findMany({
    where: orderWhere(f),
    orderBy: { createdAt: "desc" },
    take: ORDER_EXPORT_LIMIT,
    select: ORDER_ROW_SELECT,
  });
}

/** What an order is for, one line per product (or per license usage type). */
export function orderLines(o: AdminOrderRow): { name: string; price: Prisma.Decimal }[] {
  if (o.licenseRequest) {
    const product = o.licenseRequest.productNameTHSnapshot;
    return o.licenseRequest.items.map((i) => ({ name: `${product} — License: ${i.nameTHSnapshot}`, price: i.price }));
  }
  return o.items.map((i) => ({
    name: i.variantNameTHSnapshot ? `${i.productNameTHSnapshot} (${i.variantNameTHSnapshot})` : i.productNameTHSnapshot,
    price: i.finalPrice,
  }));
}
