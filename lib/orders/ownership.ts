import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { OwnershipContext } from "@/lib/orders/rules";
import { stockTakingOrderWhere } from "@/lib/products/stock";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Cancels this customer's PENDING_PAYMENT orders that passed their deadline without a slip.
 * There is no scheduled job yet, so this runs lazily wherever orders are read or created.
 */
export function cancelExpiredOrders(userId: string, now: Date, db: Db = prisma) {
  return db.order.updateMany({
    where: { userId, status: "PENDING_PAYMENT", paymentStatus: null, expiresAt: { lte: now } },
    data: { status: "CANCELLED", cancelledAt: now },
  });
}

/** Which of `productIds` the customer already owns or has reserved in an open order. */
export async function getOwnership(
  userId: string,
  productIds: string[],
  now: Date,
  db: Db = prisma,
): Promise<OwnershipContext> {
  if (productIds.length === 0) return { owned: new Set(), inOpenOrder: new Set() };
  const items = await db.orderItem.findMany({
    where: {
      productId: { in: productIds },
      // A rejected slip ends the order, so its products are free to order again; a slip that
      // was uploaded keeps the order open even past the unpaid deadline.
      order: { userId, ...stockTakingOrderWhere(now) },
    },
    select: { productId: true, order: { select: { status: true } } },
  });
  const owned = new Set<string>();
  const inOpenOrder = new Set<string>();
  for (const i of items) (i.order.status === "COMPLETED" ? owned : inOpenOrder).add(i.productId);
  return { owned, inOpenOrder };
}
