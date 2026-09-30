import { canRetryAfterRejection, isOrderExpired, type OrderStateInput } from "@/lib/orders/rules";

/**
 * A slip can be attached while the order awaits its first payment (before the deadline).
 * After a rejection a product order takes no new slip (the customer orders again); only a
 * license order may retry. Only one slip can be under review at a time.
 */
export function canUploadSlip(order: OrderStateInput, now: Date): boolean {
  if (order.status === "PAYMENT_REJECTED") return canRetryAfterRejection(order);
  return order.status === "PENDING_PAYMENT" && order.paymentStatus === null && !isOrderExpired(order, now);
}

/** The customer may cancel an order that has no slip under review and is not paid. */
export function canCustomerCancel(order: OrderStateInput, now: Date): boolean {
  return canUploadSlip(order, now);
}

export const REJECT_REASON_MAX = 500;

/** Trimmed reason, or null when empty/too long. A rejection always needs a reason. */
export function normalizeRejectReason(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const reason = input.trim().replace(/\s+\n/g, "\n");
  return reason.length > 0 && reason.length <= REJECT_REASON_MAX ? reason : null;
}
