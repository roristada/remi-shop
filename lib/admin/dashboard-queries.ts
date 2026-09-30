import "server-only";
import { prisma } from "@/lib/prisma/client";
import { toHundredths } from "@/lib/pricing/calculate";
import { stockTakingOrderWhere, toStockInfo } from "@/lib/products/stock";
import { bangkokDayKeys, startOfBangkokDay, startOfBangkokMonth, startOfPreviousBangkokMonth } from "@/lib/admin/dashboard";

/** Days shown in the daily charts and ranked in "top products" / "by category". */
export const DASHBOARD_WINDOW_DAYS = 30;

/** Revenue = COMPLETED orders (slip approved), dated by approval time in [since, until); satang. */
const paid = (since: Date, until?: Date) => ({
  status: "COMPLETED" as const,
  paidAt: { gte: since, ...(until ? { lt: until } : {}) },
});

/** Revenue, order count, distinct buyers and product lines sold in a period. */
async function periodSummary(since: Date, until?: Date) {
  const where = paid(since, until);
  const [agg, buyers, units] = await Promise.all([
    prisma.order.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
    prisma.order.findMany({ where, distinct: ["userId"], select: { userId: true } }),
    prisma.orderItem.count({ where: { order: { ...where, kind: "PRODUCT" } } }),
  ]);
  return {
    revenue: agg._sum.total ? toHundredths(agg._sum.total) : 0,
    orders: agg._count._all,
    customers: buyers.length,
    productsSold: units,
  };
}

export type PeriodSummary = Awaited<ReturnType<typeof periodSummary>>;

export type DailyPoint = { day: string; revenue: number; orders: number };

/** One row per Bangkok calendar day for the last `days` days, zero-filled. */
async function dailySeries(now: Date, days: number): Promise<DailyPoint[]> {
  const keys = bangkokDayKeys(now, days);
  const since = startOfBangkokDay(new Date(`${keys[0]}T12:00:00+07:00`));
  const rows = await prisma.$queryRaw<{ day: string; revenue: string | null; orders: bigint }[]>`
    select to_char(paid_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as day,
           sum(total)::text as revenue,
           count(*) as orders
    from orders
    where status = 'COMPLETED' and paid_at >= ${since}
    group by 1`;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return keys.map((day) => {
    const r = byDay.get(day);
    return { day, revenue: r?.revenue ? toHundredths(r.revenue) : 0, orders: r ? Number(r.orders) : 0 };
  });
}

export type RankedRow = { id: string; name: string; revenue: number; units: number };

/** Product lines of paid product orders in the window, by revenue (license orders have no lines). */
async function topProducts(since: Date, take: number): Promise<RankedRow[]> {
  const groups = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { order: { ...paid(since), kind: "PRODUCT" } },
    _sum: { finalPrice: true },
    _count: { _all: true },
    orderBy: { _sum: { finalPrice: "desc" } },
    take,
  });
  if (groups.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: groups.map((g) => g.productId) } },
    select: { id: true, nameTH: true },
  });
  const names = new Map(products.map((p) => [p.id, p.nameTH]));
  return groups.map((g) => ({
    id: g.productId,
    name: names.get(g.productId) ?? "—",
    revenue: g._sum.finalPrice ? toHundredths(g._sum.finalPrice) : 0,
    units: g._count._all,
  }));
}

async function salesByCategory(since: Date): Promise<RankedRow[]> {
  const rows = await prisma.$queryRaw<{ id: string; name: string; revenue: string; units: bigint }[]>`
    select c.id, c.name_th as name, sum(oi.final_price)::text as revenue, count(*) as units
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    join categories c on c.id = p.category_id
    where o.status = 'COMPLETED' and o.kind = 'PRODUCT' and o.paid_at >= ${since}
    group by c.id, c.name_th
    order by sum(oi.final_price) desc`;
  return rows.map((r) => ({ id: r.id, name: r.name, revenue: toHundredths(r.revenue), units: Number(r.units) }));
}

/** Published products with a stock limit and at most `threshold` units left. */
async function lowStockProducts(now: Date, threshold = 2) {
  const limited = await prisma.product.findMany({
    where: { publishStatus: "PUBLISHED", stockLimit: { not: null } },
    select: {
      id: true,
      nameTH: true,
      stockLimit: true,
      _count: { select: { orderItems: { where: { variantId: null, order: stockTakingOrderWhere(now) } } } },
    },
    take: 200,
  });
  return limited
    .map((p) => ({ id: p.id, name: p.nameTH, stock: toStockInfo(p.stockLimit, p._count.orderItems) }))
    .filter((p): p is { id: string; name: string; stock: { limit: number; left: number } } => p.stock !== null && p.stock.left <= threshold)
    .sort((a, b) => a.stock.left - b.stock.left)
    .slice(0, 5);
}

export async function getDashboardData(now: Date = new Date()) {
  const todayStart = startOfBangkokDay(now);
  const monthStart = startOfBangkokMonth(now);
  const windowStart = startOfBangkokDay(new Date(now.getTime() - (DASHBOARD_WINDOW_DAYS - 1) * 86_400_000));

  const prevMonthStart = startOfPreviousBangkokMonth(now);
  // Same elapsed time into last month, capped at its end (a 31st has no match in a 30-day month).
  const sameTimeLastMonth = new Date(Math.min(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()), monthStart.getTime()));
  const [today, month, lastMonth, lastMonthToDate, pendingSlips, pendingLicenses, daily, top, categories, lowStock] =
    await Promise.all([
      periodSummary(todayStart),
      periodSummary(monthStart),
      periodSummary(prevMonthStart, monthStart),
      periodSummary(prevMonthStart, sameTimeLastMonth),
      prisma.order.count({ where: { status: "WAITING_REVIEW" } }),
      prisma.licenseRequest.count({ where: { status: "PENDING_REVIEW" } }),
      dailySeries(now, DASHBOARD_WINDOW_DAYS),
      topProducts(windowStart, 5),
      salesByCategory(windowStart),
      lowStockProducts(now),
    ]);

  return {
    today,
    month,
    lastMonth,
    lastMonthToDate,
    todo: { pendingSlips, pendingLicenses, lowStock },
    daily,
    top,
    categories,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
