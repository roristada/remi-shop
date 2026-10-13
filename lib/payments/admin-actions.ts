"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { fail, ok, okNotice, type ActionResult } from "@/lib/actions/result";
import { normalizeRejectReason, REJECT_REASON_MAX, slipResubmitDeadline } from "@/lib/payments/rules";
import { idSchema } from "@/lib/validation/product";
import { notifyUser } from "@/lib/notifications/service";
import { approvePaymentTx, StaleReview } from "@/lib/payments/approval";
import { autoCheckSlip } from "@/lib/payments/auto-check";
import { isSlipOkConfigured } from "@/lib/payments/slipok";
import { RETRYABLE_RESULTS } from "@/lib/payments/slip-check";

/** Minimum gap between two checks of the same slip, so repeated clicks do not burn SlipOK quota. */
const RECHECK_COOLDOWN_MS = 30_000;

function revalidatePayments() {
  revalidatePath("/admin/payments");
  revalidatePath("/[locale]/orders/[orderNumber]", "page");
}

/** Approves a slip under review (see `approvePaymentTx` for the race guarantees). */
export async function approvePayment(paymentId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(paymentId).success) return fail("คำขอไม่ถูกต้อง");
  const now = new Date();

  try {
    await prisma.$transaction((tx) => approvePaymentTx(tx, paymentId, admin.id, now));
  } catch (error) {
    if (error instanceof StaleReview) return fail("รายการนี้ถูกตรวจไปแล้ว กรุณารีเฟรชหน้า");
    console.error("Payment approve failed", { paymentId, error });
    return fail("อนุมัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  console.info("Payment approved", { paymentId, adminId: admin.id });
  revalidatePayments();
  return ok(undefined, "อนุมัติการชำระเงินแล้ว");
}

/**
 * Rejects a slip with a reason the customer will see. A product order ends here (the customer orders
 * again); a license order can take a new slip.
 */
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
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { orderId: true, order: { select: { userId: true, orderNumber: true } } },
      });
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
      await notifyUser(tx, payment.order.userId, "PAYMENT_REJECTED", { orderNumber: payment.order.orderNumber, reason });
    });
  } catch (error) {
    if (error instanceof StaleReview) return fail("รายการนี้ถูกตรวจไปแล้ว กรุณารีเฟรชหน้า");
    console.error("Payment reject failed", { paymentId, error });
    return fail("ปฏิเสธไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  console.info("Payment rejected", { paymentId, adminId: admin.id });
  revalidatePayments();
  return ok(undefined, "ปฏิเสธสลิปแล้ว ลูกค้าจะเห็นเหตุผล");
}

/**
 * Rejects a slip but keeps a product order open: it goes back to awaiting payment with a fresh
 * deadline, so the customer attaches a new slip to the same order (e.g. they sent the wrong image).
 * Past the deadline the order is cancelled like any unpaid order.
 */
export async function requestNewSlip(paymentId: string, reasonInput: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(paymentId).success) return fail("คำขอไม่ถูกต้อง");
  const reason = normalizeRejectReason(reasonInput);
  if (!reason) {
    return fail("กรุณาระบุเหตุผล", { reason: `กรุณาระบุเหตุผล (ไม่เกิน ${REJECT_REASON_MAX} ตัวอักษร)` });
  }
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { orderId: true, order: { select: { userId: true, orderNumber: true } } },
      });
      if (!payment) throw new StaleReview();
      // transRef is cleared so the same transfer can be attached again if that is what the customer resends.
      const updated = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: ["WAITING", "REVIEWING"] } },
        data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: now, rejectReason: reason, transRef: null },
      });
      const order = await tx.order.updateMany({
        where: { id: payment.orderId, status: "WAITING_REVIEW", kind: "PRODUCT" },
        data: { status: "PENDING_PAYMENT", paymentStatus: null, expiresAt: slipResubmitDeadline(now) },
      });
      if (updated.count !== 1 || order.count !== 1) throw new StaleReview();
      await notifyUser(tx, payment.order.userId, "PAYMENT_REJECTED", { orderNumber: payment.order.orderNumber, reason });
    });
  } catch (error) {
    if (error instanceof StaleReview) return fail("รายการนี้ถูกตรวจไปแล้ว กรุณารีเฟรชหน้า");
    console.error("Slip resubmit request failed", { paymentId, error });
    return fail("ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  console.info("New slip requested", { paymentId, adminId: admin.id });
  revalidatePayments();
  return ok(undefined, "ขอสลิปใหม่แล้ว ลูกค้าแนบสลิปใหม่ได้ภายใน 24 ชั่วโมง");
}

/**
 * Runs the automatic slip check again, for a slip the first check could not judge (bank not ready
 * yet, bank or SlipOK down). Approves the order when it now passes, like the first check would.
 */
export async function recheckPayment(paymentId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(paymentId).success) return fail("คำขอไม่ถูกต้อง");
  if (!isSlipOkConfigured()) return fail("ยังไม่ได้ตั้งค่า SlipOK");

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { status: true, autoCheckResult: true, autoCheckedAt: true },
  });
  if (!payment || payment.status !== "WAITING") return fail("รายการนี้ถูกตรวจไปแล้ว กรุณารีเฟรชหน้า");
  if (!payment.autoCheckResult || !RETRYABLE_RESULTS.includes(payment.autoCheckResult)) {
    return fail("สลิปนี้ตรวจซ้ำไม่ได้ กรุณาตรวจด้วยตนเอง");
  }
  if (payment.autoCheckedAt && Date.now() - payment.autoCheckedAt.getTime() < RECHECK_COOLDOWN_MS) {
    return fail("เพิ่งตรวจไป กรุณารอสักครู่แล้วลองใหม่");
  }

  const approved = await autoCheckSlip(paymentId).catch((error: unknown) => {
    console.error("Slip re-check failed", { paymentId, error });
    return false;
  });
  console.info("Payment slip re-checked", { paymentId, adminId: admin.id, approved });
  revalidatePayments();
  return approved
    ? okNotice(undefined, "ตรวจผ่านแล้ว อนุมัติคำสั่งซื้ออัตโนมัติ")
    : okNotice(undefined, "ตรวจอัตโนมัติยังไม่ผ่าน ดูเหตุผลล่าสุดในรายการ");
}
