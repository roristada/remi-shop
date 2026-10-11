"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
import { notifyAdmins } from "@/lib/notifications/service";
import { autoCheckSlip } from "@/lib/payments/auto-check";
import { clientMeta } from "@/lib/security/log";

/** Codes map to `cart.slip.errors.*` translation keys. */
export type SlipErrorCode = "LOGIN_REQUIRED" | "NOT_ALLOWED" | "ERROR" | "not_found" | FileTypeError;
export type SlipResult<T = undefined> = { ok: true; data: T } | { ok: false; code: SlipErrorCode };

/** Longest client-supplied text kept in a diagnostic log line. */
const LOG_TEXT_MAX = 200;

/**
 * Warn-level `[slip]` log for every failed attempt, so a customer report ("it took several tries")
 * can be traced with `netlify logs -l warn`. No file contents, emails or tokens.
 */
async function logSlipFailure(details: Record<string, unknown>): Promise<void> {
  console.warn("[slip] upload failed", { ...details, ...clientMeta(await headers()) });
}

async function slipFailure(
  step: "request" | "confirm",
  code: SlipErrorCode,
  details: Record<string, unknown>,
): Promise<{ ok: false; code: SlipErrorCode }> {
  await logSlipFailure({ step, code, ...details });
  return { ok: false, code };
}

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
  const log = { orderNumber: String(orderNumber).slice(0, 40), userId: user.id };
  if (!parsed.success) return slipFailure("request", "unsupported_type", { ...log, reason: "invalid input" });

  const { fileName, size } = parsed.data;
  const typeError = checkFileMeta(IMAGE_FILE_TYPES, fileName, size);
  if (typeError) return slipFailure("request", typeError, { ...log, ext: getExtension(fileName), size });

  const now = new Date();
  const order = await findUploadableOrder(user.id, orderNumber, now);
  if (!order) return slipFailure("request", "NOT_ALLOWED", log);

  const upload = await createSignedUpload(BUCKETS.paymentSlips, newSlipPath(order.id, fileName, now));
  return upload ? { ok: true, data: upload } : slipFailure("request", "ERROR", { ...log, reason: "signed upload url" });
}

/** `approved`: the automatic check passed and the order is already complete. */
export async function confirmSlipUpload(
  orderNumber: string,
  input: { path: string; fileName: string },
): Promise<SlipResult<{ approved: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };

  const now = new Date();
  const order = await findUploadableOrder(user.id, orderNumber, now);
  // The path must be one we issued for this order (no other customer's order, no other bucket key).
  const log = { orderNumber: String(orderNumber).slice(0, 40), userId: user.id };
  if (!order || typeof input?.path !== "string" || !isSlipPath(input.path, order.id)) {
    return slipFailure("confirm", "NOT_ALLOWED", { ...log, reason: order ? "bad path" : "order not uploadable" });
  }
  if (typeof input.fileName !== "string" || getExtension(input.path) !== getExtension(input.fileName)) {
    await removeObjects(BUCKETS.paymentSlips, [input.path]);
    return slipFailure("confirm", "unsupported_type", { ...log, reason: "extension changed" });
  }

  const verified = await verifyUploadedObject(BUCKETS.paymentSlips, input.path, input.fileName);
  if (!verified.ok) return slipFailure("confirm", verified.error, { ...log, ext: getExtension(input.fileName) });

  let paymentId: string;
  try {
    paymentId = await prisma.$transaction(async (tx) => {
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
      const payment = await tx.payment.create({
        data: { orderId: order.id, amount: order.total, slipPath: input.path, status: "WAITING" },
        select: { id: true },
      });
      return payment.id;
    });
  } catch (error) {
    await removeObjects(BUCKETS.paymentSlips, [input.path]);
    if (isUniqueViolation(error) || (error instanceof Error && error.message === "ORDER_STATE_CHANGED")) {
      return slipFailure("confirm", "NOT_ALLOWED", { ...log, reason: "order state changed" });
    }
    console.error("Slip confirm failed", { orderId: order.id, userId: user.id, error });
    return { ok: false, code: "ERROR" };
  }

  console.info("Payment slip submitted", { orderId: order.id, userId: user.id });
  // The slip is saved; the check can only move it on, so an error here leaves it for the admin.
  const approved = await autoCheckSlip(paymentId).catch((error: unknown) => {
    console.error("Slip auto-check failed", { paymentId, error });
    return false;
  });
  if (!approved) {
    await notifyAdmins(prisma, "ADMIN_SLIP_SUBMITTED", { orderNumber: order.orderNumber }).catch((error: unknown) =>
      console.error("Admin slip notification failed", { orderId: order.id, error }),
    );
  }

  revalidatePath("/[locale]/orders/[orderNumber]", "page");
  revalidatePath("/admin/payments");
  return { ok: true, data: { approved } };
}

/**
 * Diagnostics only: the browser reports a failure the server cannot see (the direct upload to
 * storage, or a server action call that never arrived). Changes nothing; just logs.
 */
export async function reportSlipClientFailure(
  orderNumber: string,
  input: { stage: string; reason: string; size: number; type: string; ext: string },
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const text = (value: unknown) => (typeof value === "string" ? value.slice(0, LOG_TEXT_MAX) : null);
  await logSlipFailure({
    step: "client",
    stage: text(input?.stage),
    reason: text(input?.reason),
    orderNumber: text(orderNumber)?.slice(0, 40),
    userId: user.id,
    size: typeof input?.size === "number" ? input.size : null,
    type: text(input?.type)?.slice(0, 60),
    ext: text(input?.ext)?.slice(0, 10),
  });
}
