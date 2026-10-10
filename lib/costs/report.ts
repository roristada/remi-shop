import "server-only";
import { prisma } from "@/lib/prisma/client";
import { toHundredths } from "@/lib/pricing/calculate";
import { aggregateProfit, type ProfitLine } from "@/lib/costs/profit";

/** Lines read per report; narrow the date range beyond this. */
export const PROFIT_LINE_LIMIT = 20_000;
export const PROFIT_ORDERS_PAGE_SIZE = 20;

/**
 * Sales, cost and profit of completed product orders paid in [from, to]. Costs are the snapshots
 * taken at completion; license income has no cost and is reported on its own.
 */
export async function getProfitReport(from: Date, to: Date, page: number) {
  const paid = { status: "COMPLETED" as const, paidAt: { gte: from, lte: to } };
  const [items, license, orderCount] = await Promise.all([
    prisma.orderItem.findMany({
      where: { order: { ...paid, kind: "PRODUCT" } },
      take: PROFIT_LINE_LIMIT,
      select: {
        orderId: true,
        productId: true,
        productNameTHSnapshot: true,
        variantNameTHSnapshot: true,
        finalPrice: true,
        cost: true,
        costYuan: true,
        costIsPromo: true,
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
  const report = aggregateProfit(lines);

  // Newest paid orders first, one page at a time, with their lines.
  const orders = await prisma.order.findMany({
    where: { ...paid, kind: "PRODUCT" },
    orderBy: { paidAt: "desc" },
    skip: (page - 1) * PROFIT_ORDERS_PAGE_SIZE,
    take: PROFIT_ORDERS_PAGE_SIZE,
    select: {
      id: true,
      orderNumber: true,
      paidAt: true,
      user: { select: { email: true } },
      items: {
        orderBy: { id: "asc" },
        select: { id: true, productNameTHSnapshot: true, variantNameTHSnapshot: true, finalPrice: true, cost: true, costYuan: true, costIsPromo: true },
      },
    },
  });

  return {
    ...report,
    truncated: items.length >= PROFIT_LINE_LIMIT,
    orderCount,
    licenseRevenue: license._sum.total ? toHundredths(license._sum.total) : 0,
    licenseCount: license._count,
    orders: orders.map((o) => ({ ...o, totals: report.orders.get(o.id) ?? null })),
    pageCount: Math.max(1, Math.ceil(orderCount / PROFIT_ORDERS_PAGE_SIZE)),
  };
}
