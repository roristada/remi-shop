"use server";

import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isUniqueViolation } from "@/lib/prisma/errors";
import { getProductStatus } from "@/lib/products/status";
import { idSchema } from "@/lib/validation/product";
import { canJoinWaitlist, isWaiting } from "@/lib/waitlist/rules";

export type WaitlistActionResult =
  | { ok: true; joined: boolean }
  | { ok: false; code: "LOGIN_REQUIRED" | "NOT_SCHEDULED" | "ERROR" };

/**
 * Joins or leaves the waitlist. Joining is checked against the product's server-side status; the
 * primary key (user, product) makes a double click land on one row.
 */
export async function toggleWaitlist(productId: string): Promise<WaitlistActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!idSchema.safeParse(productId).success) return { ok: false, code: "ERROR" };

  const key = { userId_productId: { userId: user.id, productId } };
  const [entry, product] = await Promise.all([
    prisma.waitlistEntry.findUnique({ where: key, select: { notifiedAt: true } }),
    prisma.product.findUnique({ where: { id: productId }, select: { publishStatus: true, saleStartAt: true, saleEndAt: true } }),
  ]);

  try {
    if (isWaiting(entry)) {
      await prisma.waitlistEntry.deleteMany({ where: { userId: user.id, productId } });
      return { ok: true, joined: false };
    }
    if (!product || !canJoinWaitlist(getProductStatus(product))) return { ok: false, code: "NOT_SCHEDULED" };
    // Already notified once (the sale date was moved later): wait again.
    await prisma.waitlistEntry.upsert({
      where: key,
      create: { userId: user.id, productId },
      update: { notifiedAt: null, createdAt: new Date() },
    });
  } catch (error) {
    // Two clicks raced to create the same row: it exists, which is the outcome asked for.
    if (!isUniqueViolation(error)) {
      console.error("[waitlist] toggle failed", { userId: user.id, productId, message: (error as Error).message });
      return { ok: false, code: "ERROR" };
    }
  }
  console.info("[waitlist] joined", { productId });
  return { ok: true, joined: true };
}
