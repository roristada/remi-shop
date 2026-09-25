"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { normalizeRejectReason, REJECT_REASON_MAX } from "@/lib/payments/rules";
import { idSchema } from "@/lib/validation/product";

class StaleReview extends Error {}

function revalidatePayments() {
  revalidatePath("/admin/payments");
  revalidatePath("/[locale]/orders/[orderNumber]", "page");
}

/**
 * Approves a slip under review: Payment → APPROVED, Order → COMPLETED (download access comes from
 * the completed order). Both updates are conditional, so a double click or two admins reviewing the
 * same slip cannot approve twice or approve a slip that was already rejected.
 */
export async function approvePayment(paymentId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(paymentId).success) return fail("คำขอไม่ถูกต้อง");
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { orderId: true } });
      if (!payment) throw new StaleReview();
      const updated = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: ["WAITING", "REVIEWING"] } },
        data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: now, rejectReason: null },
      });
      const order = await tx.order.updateMany({
        where: { id: payment.orderId, status: "WAITING_REVIEW" },
        data: { status: "COMPLETED", paymentStatus: "APPROVED", paidAt: now },
      });
      if (updated.count !== 1 || order.count !== 1) throw new StaleReview();
    });
  } catch (error) {
    if (error instanceof StaleReview) return fail("รายการนี้ถูกตรวจไปแล้ว กรุณารีเฟรชหน้า");
    console.error("Payment approve failed", { paymentId, error });
    return fail("อนุมัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  console.info("Payment approved", { paymentId, adminId: admin.id });
  revalidatePayments();
  return ok(undefined, "อนุมัติการชำระเงินแล้ว");
}

/** Rejects a slip with a reason the customer will see; the customer can then upload a new slip. */
export async function rejectPayment(paymentId: string, reasonInput: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(paymentId).success) return fail("คำขอไม่ถูกต้อง");
  const reason = normalizeRejectReason(reasonInput);
  if (!reason) {
    return fail("กรุณาระบุเหตุผล", { reason: `กรุณาระบุเหตุผล (ไม่เกิน ${REJECT_REASON_MAX} ตัวอักษร)` });
  }
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, select: { orderId: true } });
      if (!payment) throw new StaleReview();
      const updated = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: ["WAITING", "REVIEWING"] } },
        data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: now, rejectReason: reason },
      });
      const order = await tx.order.updateMany({
        where: { id: payment.orderId, status: "WAITING_REVIEW" },
        data: { status: "PAYMENT_REJECTED", paymentStatus: "REJECTED" },
      });
      if (updated.count !== 1 || order.count !== 1) throw new StaleReview();
    });
  } catch (error) {
    if (error instanceof StaleReview) return fail("รายการนี้ถูกตรวจไปแล้ว กรุณารีเฟรชหน้า");
    console.error("Payment reject failed", { paymentId, error });
    return fail("ปฏิเสธไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  console.info("Payment rejected", { paymentId, adminId: admin.id });
  revalidatePayments();
  return ok(undefined, "ปฏิเสธสลิปแล้ว ลูกค้าจะเห็นเหตุผลและแนบสลิปใหม่ได้");
}
