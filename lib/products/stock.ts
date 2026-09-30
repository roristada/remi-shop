import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Orders that hold a unit of stock: completed, under review, or awaiting payment before the
 * deadline (a slip that arrived counts even past it). Expired, cancelled and rejected orders
 * drop out, so their unit is free again with no release step. Same states that block a
 * customer from ordering a product twice (getOwnership).
 */
export function stockTakingOrderWhere(now: Date): Prisma.OrderWhereInput {
  return {
    OR: [
      { status: { in: ["COMPLETED", "WAITING_REVIEW"] } },
      { status: "PENDING_PAYMENT", expiresAt: { gt: now } },
      { status: "PENDING_PAYMENT", paymentStatus: { not: null } },
    ],
  };
}

/**
 * Filtered relation count for a product select: `_count.orderItems` = units of the product itself
 * taken. Variant lines don't count here; each variant has its own stock (variantStockTakenCountSelect).
 */
export function stockTakenCountSelect(now: Date) {
  return {
    orderItems: { where: { variantId: null, order: stockTakingOrderWhere(now) } },
  } satisfies Prisma.ProductCountOutputTypeSelect;
}

/** Same as stockTakenCountSelect, for a variant select. */
export function variantStockTakenCountSelect(now: Date) {
  return { orderItems: { where: { order: stockTakingOrderWhere(now) } } } satisfies Prisma.ProductVariantCountOutputTypeSelect;
}

/** Stock of a product with a limit; null = unlimited. */
export type StockInfo = { limit: number; left: number } | null;

export function toStockInfo(stockLimit: number | null, taken: number): StockInfo {
  if (stockLimit === null) return null;
  return { limit: stockLimit, left: Math.max(0, stockLimit - taken) };
}

export function isSoldOut(stock: StockInfo): boolean {
  return stock !== null && stock.left === 0;
}
