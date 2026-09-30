import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { notifyUser } from "@/lib/notifications/service";

/** The payment was already reviewed (or its order moved on) — nothing was changed. */
export class StaleReview extends Error {}

/**
 * Approves a slip under review inside the caller's transaction: Payment → APPROVED, Order → COMPLETED
 * (download access comes from the completed order). Both updates are conditional, so a double click,
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
  await notifyUser(tx, payment.order.userId, "PAYMENT_APPROVED", { orderNumber: payment.order.orderNumber });
}
