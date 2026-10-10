import "server-only";
import { prisma } from "@/lib/prisma/client";
import { toHundredths } from "@/lib/pricing/calculate";
import { aggregateProfit, type ProfitLine } from "@/lib/costs/profit";

/** Lines read per report; narrow the date range beyond this. */
export const PROFIT_LINE_LIMIT = 20_000;
export const PROFIT_ORDERS_PAGE_SIZE = 20;

const paidIn = (from: Date, to: Date) => ({ status: "COMPLETED" as const, paidAt: { gte: from, lte: to } });

/**
 * Sales, cost and profit of completed product orders paid in [from, to], by brand and product.
 * Costs are the snapshots taken at completion; license income has no cost and is reported apart.
 */
export async function getProfitSummary(from: Date, to: Date) {
  const paid = paidIn(from, to);
  const [items, license, orderCount] = await Promise.all([
    prisma.orderItem.findMany({
      where: { order: { ...paid, kind: "PRODUCT" } },
      take: PROFIT_LINE_LIMIT,
      select: {
        orderId: true,
        productId: true,
        productNameTHSnapshot: true,
        finalPrice: true,
        cost: true,
        product: { select: { folder: { select: { nameTH: true } } } },
      },
    }),
    prisma.order.aggregate({ where: { ...paid, kind: "LICENSE" }, _sum: { total: true }, _count: true }),
    prisma.order.count({ where: { ...paid, kind: "PRODUCT" } }),
  ]);

  const lines: ProfitLine[] = items.map((i) => ({
    orderId: i.orderId,
    productId: i.productId,
    productName: i.productNameTHSnapshot,
    folder: i.product.folder?.nameTH ?? null,
    revenue: toHundredths(i.finalPrice),
    cost: i.cost === null ? null : toHundredths(i.cost),
  }));
  const { totals, folders, topProducts } = aggregateProfit(lines, 8);
  return {
    totals,
    folders,
    topProducts,
    orderCount,
    truncated: items.length >= PROFIT_LINE_LIMIT,
    licenseRevenue: license._sum.total ? toHundredths(license._sum.total) : 0,
    licenseCount: license._count,
  };
}

/** Paid product orders in the period (the page header's count on tabs that skip the summary). */
export function countPaidProductOrders(from: Date, to: Date) {
  return prisma.order.count({ where: { ...paidIn(from, to), kind: "PRODUCT" } });
}

/** One page of paid product orders, newest first, each with its lines and totals (satang). */
export async function listProfitOrders(from: Date, to: Date, page: number) {
  const where = { ...paidIn(from, to), kind: "PRODUCT" as const };
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * PROFIT_ORDERS_PAGE_SIZE,
      take: PROFIT_ORDERS_PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        paidAt: true,
        user: { select: { email: true, displayName: true } },
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            productNameTHSnapshot: true,
            variantNameTHSnapshot: true,
            finalPrice: true,
            cost: true,
            costYuan: true,
            costIsPromo: true,
          },
        },
      },
    }),
  ]);
  return {
    pageCount: Math.max(1, Math.ceil(total / PROFIT_ORDERS_PAGE_SIZE)),
    orders: orders.map((o) => {
      const { totals } = aggregateProfit(
        o.items.map((i) => ({
          orderId: o.id,
          productId: i.id,
          productName: "",
          folder: null,
          revenue: toHundredths(i.finalPrice),
          cost: i.cost === null ? null : toHundredths(i.cost),
        })),
      );
      return { ...o, totals };
    }),
  };
}
