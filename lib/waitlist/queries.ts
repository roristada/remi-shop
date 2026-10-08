import "server-only";
import { prisma } from "@/lib/prisma/client";
import { isWaiting } from "@/lib/waitlist/rules";

/** Whether this customer is waiting to hear that the product went on sale. */
export function isOnWaitlist(userId: string, productId: string) {
  return prisma.waitlistEntry
    .findUnique({ where: { userId_productId: { userId, productId } }, select: { notifiedAt: true } })
    .then(isWaiting);
}

/** Customers still waiting for this product (admin). */
export function countWaitlist(productId: string) {
  return prisma.waitlistEntry.count({ where: { productId, notifiedAt: null } });
}
