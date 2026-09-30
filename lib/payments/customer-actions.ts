"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isUniqueViolation } from "@/lib/prisma/errors";
import { orderNumberSchema } from "@/lib/orders/validation";
import { canUploadSlip } from "@/lib/payments/rules";
import { uploadRequestSchema } from "@/lib/validation/product";
import { BUCKETS } from "@/lib/storage/buckets";
import { checkFileMeta, getExtension, IMAGE_FILE_TYPES, type FileTypeError } from "@/lib/storage/file-types";
import { createSignedUpload, removeObjects, verifyUploadedObject, type SignedUpload } from "@/lib/storage/product-storage";
import { isSlipPath, newSlipPath } from "@/lib/storage/payment-storage";

/** Codes map to `cart.slip.errors.*` translation keys. */
export type SlipErrorCode = "LOGIN_REQUIRED" | "NOT_ALLOWED" | "ERROR" | "not_found" | FileTypeError;
export type SlipResult<T = undefined> = { ok: true; data: T } | { ok: false; code: SlipErrorCode };

/** The caller's own order in a state that accepts a slip. The order is never chosen by id from the client. */
async function findUploadableOrder(userId: string, orderNumberInput: string, now: Date) {
  const parsed = orderNumberSchema.safeParse(orderNumberInput);
  if (!parsed.success) return null;
  const order = await prisma.order.findFirst({
    where: { orderNumber: parsed.data, userId },
    select: { id: true, orderNumber: true, kind: true, status: true, paymentStatus: true, expiresAt: true, total: true },
  });
  return order && canUploadSlip(order, now) ? order : null;
}

export async function requestSlipUpload(
  orderNumber: string,
  input: { fileName: string; size: number },
): Promise<SlipResult<SignedUpload>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "unsupported_type" };

  const typeError = checkFileMeta(IMAGE_FILE_TYPES, parsed.data.fileName, parsed.data.size);
  if (typeError) return { ok: false, code: typeError };

  const now = new Date();
  const order = await findUploadableOrder(user.id, orderNumber, now);
  if (!order) return { ok: false, code: "NOT_ALLOWED" };

  const upload = await createSignedUpload(BUCKETS.paymentSlips, newSlipPath(order.id, parsed.data.fileName, now));
  return upload ? { ok: true, data: upload } : { ok: false, code: "ERROR" };
}

export async function confirmSlipUpload(
  orderNumber: string,
  input: { path: string; fileName: string },
): Promise<SlipResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };

  const now = new Date();
  const order = await findUploadableOrder(user.id, orderNumber, now);
  // The path must be one we issued for this order (no other customer's order, no other bucket key).
  if (!order || typeof input?.path !== "string" || !isSlipPath(input.path, order.id)) {
    return { ok: false, code: "NOT_ALLOWED" };
  }
  if (typeof input.fileName !== "string" || getExtension(input.path) !== getExtension(input.fileName)) {
    await removeObjects(BUCKETS.paymentSlips, [input.path]);
    return { ok: false, code: "unsupported_type" };
  }

  const verified = await verifyUploadedObject(BUCKETS.paymentSlips, input.path, input.fileName);
  if (!verified.ok) return { ok: false, code: verified.error };

  try {
    await prisma.$transaction(async (tx) => {
      // Conditional update: a concurrent upload, cancel or expiry makes this match nothing.
      const { count } = await tx.order.updateMany({
        where: {
          id: order.id,
          userId: user.id,
          OR: [
            { status: "PAYMENT_REJECTED", kind: "LICENSE" },
            { status: "PENDING_PAYMENT", paymentStatus: null, expiresAt: { gt: now } },
          ],
        },
        data: { status: "WAITING_REVIEW", paymentStatus: "WAITING" },
      });
      if (count !== 1) throw new Error("ORDER_STATE_CHANGED");
      // At most one non-rejected payment per order (partial unique index) also guards duplicates.
      await tx.payment.create({
        data: { orderId: order.id, amount: order.total, slipPath: input.path, status: "WAITING" },
      });
    });
  } catch (error) {
    await removeObjects(BUCKETS.paymentSlips, [input.path]);
    if (isUniqueViolation(error) || (error instanceof Error && error.message === "ORDER_STATE_CHANGED")) {
      return { ok: false, code: "NOT_ALLOWED" };
    }
    console.error("Slip confirm failed", { orderId: order.id, userId: user.id, error });
    return { ok: false, code: "ERROR" };
  }

  console.info("Payment slip submitted", { orderId: order.id, userId: user.id });
  revalidatePath("/[locale]/orders/[orderNumber]", "page");
  return { ok: true, data: undefined };
}
