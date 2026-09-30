import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { toHundredths } from "@/lib/pricing/calculate";

export const CUSTOMERS_PAGE_SIZE = 20;

export type CustomerFilters = { q?: string; page: number };

type SearchParams = Record<string, string | string[] | undefined>;

export function parseCustomerFilters(sp: SearchParams): CustomerFilters {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  return { q, page };
}

/**
 * Accounts newest first, each with paid-order count, amount spent (satang) and last order date.
 * Stats are aggregated for the current page only, in one query per stat.
 */
export async function listCustomers({ q, page }: CustomerFilters) {
  const where: Prisma.ProfileWhereInput = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [total, profiles] = await prisma.$transaction([
    prisma.profile.count({ where }),
    prisma.profile.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * CUSTOMERS_PAGE_SIZE,
      take: CUSTOMERS_PAGE_SIZE,
      select: { id: true, email: true, displayName: true, role: true, createdAt: true },
    }),
  ]);

  const ids = profiles.map((p) => p.id);
  const [paid, lastOrders] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.order.groupBy({
            by: ["userId"],
            where: { userId: { in: ids }, status: "COMPLETED" },
            _count: { _all: true },
            _sum: { total: true },
          }),
          prisma.order.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { createdAt: true } }),
        ]);
  const paidBy = new Map(paid.map((g) => [g.userId, g]));
  const lastBy = new Map(lastOrders.map((g) => [g.userId, g._max.createdAt]));

  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE)),
    rows: profiles.map((p) => {
      const stats = paidBy.get(p.id);
      return {
        ...p,
        paidOrders: stats?._count._all ?? 0,
        spent: stats?._sum.total ? toHundredths(stats._sum.total) : 0,
        lastOrderAt: lastBy.get(p.id) ?? null,
      };
    }),
  };
}

/** One account with its orders, owned products, license requests and recent downloads. */
export async function getCustomer(id: string) {
  const profile = await prisma.profile.findUnique({
    where: { id },
    select: { id: true, email: true, displayName: true, role: true, createdAt: true },
  });
  if (!profile) return null;

  const [orders, paidAgg, owned, licenses, downloads] = await Promise.all([
    prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        kind: true,
        status: true,
        total: true,
        createdAt: true,
        items: { select: { productNameTHSnapshot: true, variantNameTHSnapshot: true } },
        licenseRequest: { select: { productNameTHSnapshot: true } },
      },
    }),
    prisma.order.aggregate({ where: { userId: id, status: "COMPLETED" }, _count: { _all: true }, _sum: { total: true } }),
    prisma.orderItem.findMany({
      where: { order: { userId: id, status: "COMPLETED", kind: "PRODUCT" } },
      orderBy: { order: { paidAt: "desc" } },
      take: 100,
      select: {
        id: true,
        productId: true,
        productNameTHSnapshot: true,
        variantNameTHSnapshot: true,
        order: { select: { paidAt: true } },
      },
    }),
    prisma.licenseRequest.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, productNameTHSnapshot: true, status: true, total: true, createdAt: true },
    }),
    prisma.download.findMany({
      where: { userId: id },
      orderBy: { downloadedAt: "desc" },
      take: 20,
      select: { id: true, downloadedAt: true, product: { select: { nameTH: true } }, file: { select: { fileName: true } } },
    }),
  ]);

  return {
    profile,
    stats: { paidOrders: paidAgg._count._all, spent: paidAgg._sum.total ? toHundredths(paidAgg._sum.total) : 0 },
    orders,
    owned,
    licenses,
    downloads,
  };
}
