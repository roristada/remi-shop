import "server-only";
import { prisma } from "@/lib/prisma/client";
import { isUniqueViolation } from "@/lib/prisma/errors";
import type { SlipCheckResult } from "@/lib/generated/prisma/enums";
import { toHundredths } from "@/lib/pricing/calculate";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKETS } from "@/lib/storage/buckets";
import { approvePaymentTx, StaleReview } from "@/lib/payments/approval";
import { evaluateSlipCheck } from "@/lib/payments/slip-check";
import { checkSlipWithSlipOk, isSlipOkConfigured } from "@/lib/payments/slipok";

/**
 * Checks a freshly submitted slip with SlipOK and approves the order when every check passes.
 * Runs after the payment row is committed, so a failure here only means the slip waits for the
 * admin as before. Called once per payment (SlipOK remembers slips; a second call would say
 * "duplicate"). Returns whether the order was approved.
 */
export async function autoCheckSlip(paymentId: string): Promise<boolean> {
  if (!isSlipOkConfigured()) return false;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { status: true, slipPath: true, order: { select: { total: true, createdAt: true } } },
  });
  if (!payment || payment.status !== "WAITING") return false;

  const { data: image, error } = await createAdminClient().storage.from(BUCKETS.paymentSlips).download(payment.slipPath);
  if (error || !image) {
    console.error("Slip auto-check: slip download failed", { paymentId, message: error?.message });
    await recordResult(paymentId, "UNAVAILABLE", null);
    return false;
  }

  const totalSatang = toHundredths(payment.order.total);
  const response = await checkSlipWithSlipOk(image, payment.slipPath.split("/").pop() ?? "slip", totalSatang);
  const { result, transRef } = evaluateSlipCheck(response, { totalSatang, createdAt: payment.order.createdAt });
  if (!response.ok) console.warn("Slip auto-check: not passed", { paymentId, result, errorCode: response.errorCode });

  if (result !== "PASSED") {
    await recordResult(paymentId, result, transRef);
    return false;
  }

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      // transRef is unique: a slip already used for another order fails here and goes to the admin.
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: "WAITING" },
        data: { transRef, autoCheckResult: "PASSED", autoCheckedAt: now },
      });
      if (count !== 1) throw new StaleReview();
      await approvePaymentTx(tx, paymentId, null, now);
    });
  } catch (error) {
    if (error instanceof StaleReview) return false; // The admin got there first.
    if (isUniqueViolation(error)) {
      await recordResult(paymentId, "DUPLICATE", null);
      return false;
    }
    console.error("Slip auto-check: approve failed", { paymentId, error });
    await recordResult(paymentId, "UNAVAILABLE", null);
    return false;
  }

  console.info("Payment auto-approved", { paymentId });
  return true;
}

/** Stores why the slip was not auto-approved. The reference is kept when it is not already taken. */
async function recordResult(paymentId: string, result: SlipCheckResult, transRef: string | null) {
  const where = { id: paymentId, status: "WAITING" as const };
  const data = { autoCheckResult: result, autoCheckedAt: new Date() };
  try {
    await prisma.payment.updateMany({ where, data: { ...data, transRef } });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      console.error("Slip auto-check: saving result failed", { paymentId, error });
      return;
    }
    // The reference already belongs to another payment: keep the reason, drop the reference.
    await prisma.payment
      .updateMany({ where, data })
      .catch((e: unknown) => console.error("Slip auto-check: saving result failed", { paymentId, error: e }));
  }
}
