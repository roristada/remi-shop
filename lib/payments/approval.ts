import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { notifyUser } from "@/lib/notifications/service";
import { snapshotOrderCosts } from "@/lib/costs/service";

/** The payment was already reviewed (or its order moved on) — nothing was changed. */
export class StaleReview extends Error {}

/**
 * Approves a slip under review inside the caller's transaction: Payment → APPROVED, Order → COMPLETED
 * (download access comes from the completed order), and the order's products' sold counts go up. Both updates are conditional, so a double click,
 * two admins, or the automatic check racing an admin cannot approve twice or approve a rejected slip.
 * `reviewerId` is null for an automatic approval.
 */
export async function approvePaymentTx(
  tx: Prisma.TransactionClient,
  paymentId: string,
  reviewerId: string | null,
  now: Date,
): Promise<void> {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    select: { orderId: true, order: { select: { userId: true, orderNumber: true } } },
  });
  if (!payment) throw new StaleReview();
  const updated = await tx.payment.updateMany({
    where: { id: paymentId, status: { in: ["WAITING", "REVIEWING"] } },
    data: { status: "APPROVED", reviewedById: reviewerId, reviewedAt: now, rejectReason: null },
  });
  const order = await tx.order.updateMany({
    where: { id: payment.orderId, status: "WAITING_REVIEW" },
    data: { status: "COMPLETED", paymentStatus: "APPROVED", paidAt: now },
  });
  if (updated.count !== 1 || order.count !== 1) throw new StaleReview();
  await addOrderToSoldCounts(tx, payment.orderId);
  await snapshotOrderCosts(tx, payment.orderId, now);
  await notifyUser(tx, payment.order.userId, "PAYMENT_APPROVED", { orderNumber: payment.order.orderNumber });
}

/**
 * Counts a completed order's lines into the products' sold counts — one per line, like the cards'
 * "sold" label. Raw SQL so a sale does not bump updatedAt. LICENSE orders have no lines.
 * Call exactly once per order, when it becomes COMPLETED.
 */
export async function addOrderToSoldCounts(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "products" AS p SET "sold_count" = p."sold_count" + s.n
    FROM (SELECT "product_id", COUNT(*)::int AS n FROM "order_items" WHERE "order_id" = ${orderId}::uuid GROUP BY "product_id") AS s
    WHERE p."id" = s."product_id"`;
}
