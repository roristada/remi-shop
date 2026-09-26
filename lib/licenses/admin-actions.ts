"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation, isNotFound } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema } from "@/lib/validation/product";
import { generateOrderNumber } from "@/lib/orders/rules";
import { normalizeRejectReason, REJECT_REASON_MAX } from "@/lib/payments/rules";
import { LICENSE_PAYMENT_DAYS_MAX, LICENSE_PAYMENT_DAYS_MIN, licensePaymentDeadline } from "@/lib/licenses/rules";

// Admin is Thai-only, so messages are Thai strings.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `ไม่เกิน ${max} ตัวอักษร`)
    .transform((v) => (v === "" ? null : v));

const usageTypeSchema = z.object({
  nameTH: z.string().trim().min(1, "กรุณากรอกข้อมูล").max(80, "ไม่เกิน 80 ตัวอักษร"),
  nameEN: z.string().trim().min(1, "กรุณากรอกข้อมูล").max(80, "ไม่เกิน 80 ตัวอักษร"),
  descriptionTH: optionalText(300),
  descriptionEN: optionalText(300),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true"),
  sortOrder: z.coerce.number().int("ต้องเป็นจำนวนเต็ม").min(0).max(9999),
});

/** Positive price, at most 2 decimals. */
const licensePrice = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "ราคาไม่ถูกต้อง (ทศนิยมไม่เกิน 2 ตำแหน่ง)")
  .refine((v) => Number(v) > 0, "ราคาต้องมากกว่า 0");

function revalidateLicenses() {
  revalidatePath("/admin/licenses", "layout");
  revalidatePath("/[locale]/product/[slug]", "layout");
}

// ───────────────────────────── Usage types ─────────────────────────────

export async function saveUsageType(
  usageTypeId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (usageTypeId !== null && !idSchema.safeParse(usageTypeId).success) return fail("ไม่พบประเภทการใช้งาน");
  const parsed = usageTypeSchema.safeParse({
    nameTH: formString(formData, "nameTH"),
    nameEN: formString(formData, "nameEN"),
    descriptionTH: formString(formData, "descriptionTH"),
    descriptionEN: formString(formData, "descriptionEN"),
    isActive: formString(formData, "isActive") || "true",
    sortOrder: formString(formData, "sortOrder") || "0",
  });
  if (!parsed.success) return invalid(parsed.error);

  try {
    if (usageTypeId) await prisma.licenseUsageType.update({ where: { id: usageTypeId }, data: parsed.data });
    else await prisma.licenseUsageType.create({ data: parsed.data });
  } catch (error) {
    if (isNotFound(error)) return fail("ไม่พบประเภทการใช้งาน");
    console.error("[licenses] save usage type failed", { message: (error as Error).message });
    return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  revalidateLicenses();
  return ok(undefined, usageTypeId ? "บันทึกประเภทการใช้งานแล้ว" : "เพิ่มประเภทการใช้งานแล้ว");
}

/** Types already used in a request cannot be deleted (FK Restrict): deactivate them instead. */
export async function deleteUsageType(usageTypeId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(usageTypeId).success) return fail("ไม่พบประเภทการใช้งาน");
  try {
    await prisma.licenseUsageType.delete({ where: { id: usageTypeId } });
  } catch (error) {
    if (isForeignKeyViolation(error)) return fail("ประเภทนี้เคยถูกขอใช้แล้ว ลบไม่ได้ ใช้ “ปิดใช้งาน” แทน");
    if (isNotFound(error)) return fail("ไม่พบประเภทการใช้งาน");
    console.error("[licenses] delete usage type failed", { message: (error as Error).message });
    return fail("ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  revalidateLicenses();
  return ok(undefined, "ลบประเภทการใช้งานแล้ว");
}

// ─────────────────────────── Product prices ────────────────────────────

const pricingSchema = z
  .array(z.object({ usageTypeId: z.uuid(), enabled: z.boolean(), price: z.string() }))
  .max(200);

/**
 * Replaces this product's license prices. Enabled rows are upserted, the rest removed.
 * Requests already submitted keep their own price snapshot.
 */
export async function saveProductLicensePrices(productId: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) return fail("ข้อมูลไม่ถูกต้อง");

  const fieldErrors: Record<string, string> = {};
  const enabled: { usageTypeId: string; price: string }[] = [];
  for (const row of parsed.data) {
    if (!row.enabled) continue;
    const price = licensePrice.safeParse(row.price);
    if (!price.success) fieldErrors[row.usageTypeId] = price.error.issues[0].message;
    else enabled.push({ usageTypeId: row.usageTypeId, price: price.data });
  }
  if (Object.keys(fieldErrors).length > 0) return fail("กรุณาตรวจสอบราคา", fieldErrors);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.productLicensePrice.deleteMany({
        where: { productId, usageTypeId: { notIn: enabled.map((e) => e.usageTypeId) } },
      });
      for (const e of enabled) {
        await tx.productLicensePrice.upsert({
          where: { productId_usageTypeId: { productId, usageTypeId: e.usageTypeId } },
          create: { productId, usageTypeId: e.usageTypeId, price: e.price },
          update: { price: e.price },
        });
      }
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) return fail("สินค้าหรือประเภทการใช้งานถูกลบไปแล้ว กรุณารีเฟรชหน้า");
    console.error("[licenses] save product prices failed", { productId, message: (error as Error).message });
    return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/[locale]/product/[slug]", "layout");
  return ok(undefined, "บันทึกราคา License แล้ว");
}

// ─────────────────────────────── Review ────────────────────────────────

class StaleReview extends Error {}

/**
 * Approves a request and opens its payment: creates an Order (kind LICENSE, no items, so it never
 * grants file access) for the locked total, due in `licensePaymentDays`. The conditional update
 * makes a double click or two admins unable to approve twice.
 */
export async function approveLicenseRequest(requestId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(requestId).success) return fail("คำขอไม่ถูกต้อง");
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      const request = await tx.licenseRequest.findUnique({
        where: { id: requestId },
        select: { userId: true, total: true, status: true },
      });
      if (!request || request.status !== "PENDING_REVIEW") throw new StaleReview();

      const settings = await tx.storeSetting.findUnique({ where: { id: 1 }, select: { licensePaymentDays: true } });
      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(now, randomBytes(6)),
          userId: request.userId,
          kind: "LICENSE",
          subtotal: request.total,
          total: request.total,
          expiresAt: licensePaymentDeadline(now, settings?.licensePaymentDays ?? 3),
        },
        select: { id: true },
      });
      const updated = await tx.licenseRequest.updateMany({
        where: { id: requestId, status: "PENDING_REVIEW" },
        data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: now, orderId: order.id, rejectReason: null },
      });
      if (updated.count !== 1) throw new StaleReview();
    });
  } catch (error) {
    if (error instanceof StaleReview) return fail("คำขอนี้ถูกพิจารณาหรือยกเลิกไปแล้ว กรุณารีเฟรชหน้า");
    console.error("License approve failed", { requestId, error });
    return fail("อนุมัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  console.info("License request approved", { requestId, adminId: admin.id });
  revalidatePath("/admin/licenses");
  revalidatePath("/[locale]/account/licenses", "page");
  return ok(undefined, "อนุมัติแล้ว ลูกค้าจะเห็นช่องทางชำระเงินในหน้า License ของฉัน");
}

export async function rejectLicenseRequest(requestId: string, reasonInput: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(requestId).success) return fail("คำขอไม่ถูกต้อง");
  const reason = normalizeRejectReason(reasonInput);
  if (!reason) {
    return fail("กรุณาระบุเหตุผล", { reason: `กรุณาระบุเหตุผล (ไม่เกิน ${REJECT_REASON_MAX} ตัวอักษร)` });
  }

  const { count } = await prisma.licenseRequest.updateMany({
    where: { id: requestId, status: "PENDING_REVIEW" },
    data: { status: "REJECTED", reviewedById: admin.id, reviewedAt: new Date(), rejectReason: reason },
  });
  if (count !== 1) return fail("คำขอนี้ถูกพิจารณาหรือยกเลิกไปแล้ว กรุณารีเฟรชหน้า");

  console.info("License request rejected", { requestId, adminId: admin.id });
  revalidatePath("/admin/licenses");
  revalidatePath("/[locale]/account/licenses", "page");
  return ok(undefined, "ปฏิเสธคำขอแล้ว ลูกค้าจะเห็นเหตุผล");
}

// ────────────────────────────── Settings ───────────────────────────────

const licenseSettingsSchema = z.object({
  licensePaymentDays: z.coerce
    .number()
    .int("ต้องเป็นจำนวนเต็ม")
    .min(LICENSE_PAYMENT_DAYS_MIN, `อย่างน้อย ${LICENSE_PAYMENT_DAYS_MIN} วัน`)
    .max(LICENSE_PAYMENT_DAYS_MAX, `ไม่เกิน ${LICENSE_PAYMENT_DAYS_MAX} วัน`),
});

/** Applies to requests approved from now on; open license orders keep their deadline. */
export async function updateLicenseSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = licenseSettingsSchema.safeParse({ licensePaymentDays: formString(formData, "licensePaymentDays") });
  if (!parsed.success) return invalid(parsed.error);
  await prisma.storeSetting.upsert({ where: { id: 1 }, create: { id: 1, ...parsed.data }, update: parsed.data });
  revalidatePath("/admin/settings");
  return ok(undefined, "บันทึกการตั้งค่า License แล้ว");
}
