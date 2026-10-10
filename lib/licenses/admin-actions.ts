"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation, isNotFound } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema } from "@/lib/validation/product";
import { notifyUser } from "@/lib/notifications/service";
import { generateOrderNumber } from "@/lib/orders/rules";
import { normalizeRejectReason, REJECT_REASON_MAX } from "@/lib/payments/rules";
import {
  LICENSE_MESSAGE_MAX,
  LICENSE_PAYMENT_DAYS_MAX,
  LICENSE_PAYMENT_DAYS_MIN,
  licensePaymentDeadline,
  OPEN_LICENSE_STATUSES,
  planChangeRequest,
} from "@/lib/licenses/rules";
import { ARTWORK_FIELD_ID } from "@/lib/licenses/form-fields";
import { fromHundredths, toHundredths } from "@/lib/pricing/calculate";

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
  conditionsTH: optionalText(1000),
  conditionsEN: optionalText(1000),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true"),
  sortOrder: z.coerce.number().int("ต้องเป็นจำนวนเต็ม").min(0).max(9999),
});

/** Positive price, at most 2 decimals. */
const licensePrice = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "ราคาไม่ถูกต้อง (ทศนิยมไม่เกิน 2 ตำแหน่ง)")
  .refine((v) => Number(v) > 0, "ราคาต้องมากกว่า 0");

function revalidateRequests() {
  revalidatePath("/admin/licenses", "layout");
  revalidatePath("/[locale]/account/licenses", "layout");
}

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
    conditionsTH: formString(formData, "conditionsTH"),
    conditionsEN: formString(formData, "conditionsEN"),
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

class ChangeRequestError extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super("change request");
  }
}

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
        select: { userId: true, total: true, status: true, productNameTHSnapshot: true, productNameENSnapshot: true },
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
      await tx.licenseRequestEvent.create({ data: { requestId, type: "APPROVED", actorId: admin.id, newTotal: request.total } });
      await notifyUser(tx, request.userId, "LICENSE_APPROVED", {
        productNameTH: request.productNameTHSnapshot,
        productNameEN: request.productNameENSnapshot,
        requestId,
      });
    });
  } catch (error) {
    if (error instanceof StaleReview) return fail("คำขอนี้ถูกพิจารณาหรือยกเลิกไปแล้ว กรุณารีเฟรชหน้า");
    console.error("License approve failed", { requestId, error });
    return fail("อนุมัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  console.info("License request approved", { requestId, adminId: admin.id });
  revalidateRequests();
  return ok(undefined, "อนุมัติแล้ว ลูกค้าจะเห็นช่องทางชำระเงินในหน้า License ของฉัน");
}

export async function rejectLicenseRequest(requestId: string, reasonInput: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(requestId).success) return fail("คำขอไม่ถูกต้อง");
  const reason = normalizeRejectReason(reasonInput);
  if (!reason) {
    return fail("กรุณาระบุเหตุผล", { reason: `กรุณาระบุเหตุผล (ไม่เกิน ${REJECT_REASON_MAX} ตัวอักษร)` });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.licenseRequest.updateMany({
        // Also while waiting for the customer: the store may decide not to continue.
        where: { id: requestId, status: { in: [...OPEN_LICENSE_STATUSES] } },
        data: {
          status: "REJECTED",
          reviewedById: admin.id,
          reviewedAt: new Date(),
          rejectReason: reason,
          proposedTotal: null,
          priceChangeReason: null,
          infoRequestMessage: null,
          infoRequestFields: [],
        },
      });
      if (count !== 1) throw new StaleReview();
      const request = await tx.licenseRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { userId: true, productNameTHSnapshot: true, productNameENSnapshot: true },
      });
      await tx.licenseRequestEvent.create({ data: { requestId, type: "REJECTED", actorId: admin.id, message: reason } });
      await notifyUser(tx, request.userId, "LICENSE_REJECTED", {
        productNameTH: request.productNameTHSnapshot,
        productNameEN: request.productNameENSnapshot,
        reason,
        requestId,
      });
    });
  } catch (error) {
    if (error instanceof StaleReview) return fail("คำขอนี้ถูกพิจารณาหรือยกเลิกไปแล้ว กรุณารีเฟรชหน้า");
    console.error("License reject failed", { requestId, error });
    return fail("ปฏิเสธไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  console.info("License request rejected", { requestId, adminId: admin.id });
  revalidateRequests();
  return ok(undefined, "ปฏิเสธคำขอแล้ว ลูกค้าจะเห็นเหตุผล");
}

const changeRequestSchema = z.object({
  /** Baht as typed; empty = keep the price. */
  newTotal: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{1,8}(\.\d{1,2})?$/.test(v), "ราคาไม่ถูกต้อง (ทศนิยมไม่เกิน 2 ตำแหน่ง)"),
  priceReason: optionalText(LICENSE_MESSAGE_MAX),
  message: optionalText(LICENSE_MESSAGE_MAX),
  fieldIds: z.array(z.string().max(64)).max(60),
});

/**
 * Sends a pending request back to the customer: a new price (optional reason), and/or a request
 * to complete or correct details (optional message, flagged fields). Nothing is required beyond
 * one actual change. The customer's answer (or acceptance of the price) returns it for review.
 */
export async function requestLicenseChanges(requestId: string, input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(requestId).success) return fail("คำขอไม่ถูกต้อง");
  const parsed = changeRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { priceReason, message } = parsed.data;

  const validFieldIds = new Set(
    (await prisma.licenseFormField.findMany({ select: { id: true } })).map((f) => f.id).concat(ARTWORK_FIELD_ID),
  );
  const fieldIds = [...new Set(parsed.data.fieldIds)].filter((id) => validFieldIds.has(id));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`select id from license_requests where id = ${requestId}::uuid for update`;
      const request = await tx.licenseRequest.findUnique({
        where: { id: requestId },
        select: { userId: true, total: true, status: true, productNameTHSnapshot: true, productNameENSnapshot: true },
      });
      if (!request || request.status !== "PENDING_REVIEW") throw new StaleReview();

      const newTotal = parsed.data.newTotal === "" ? null : toHundredths(parsed.data.newTotal);
      const plan = planChangeRequest({ currentTotal: toHundredths(request.total), newTotal, message, fieldIds });
      if (!plan.ok) {
        throw new ChangeRequestError(
          plan.code === "BAD_PRICE"
            ? { newTotal: "ราคาต้องมากกว่า 0" }
            : { form: "แก้ราคา หรือระบุข้อมูลที่ต้องการเพิ่มอย่างน้อยหนึ่งอย่าง" },
        );
      }

      await tx.licenseRequest.update({
        where: { id: requestId },
        data: {
          status: plan.status,
          proposedTotal: plan.priceChanged ? fromHundredths(newTotal!) : null,
          priceChangeReason: plan.priceChanged ? priceReason : null,
          infoRequestMessage: message,
          infoRequestFields: fieldIds,
        },
      });
      await tx.licenseRequestEvent.create({
        data: {
          requestId,
          type: "CHANGES_REQUESTED",
          actorId: admin.id,
          message,
          ...(plan.priceChanged ? { oldTotal: request.total, newTotal: fromHundredths(newTotal!) } : {}),
          // The price reason travels with the price change.
          ...(plan.priceChanged && priceReason ? { changes: [{ labelTH: "เหตุผลที่แก้ราคา", labelEN: "Price change reason", before: "", after: priceReason }] } : {}),
          fieldIds,
        },
      });
      await notifyUser(tx, request.userId, "LICENSE_CHANGES_REQUESTED", {
        productNameTH: request.productNameTHSnapshot,
        productNameEN: request.productNameENSnapshot,
        requestId,
      });
    });
  } catch (error) {
    if (error instanceof StaleReview) return fail("คำขอนี้ไม่ได้รอพิจารณาแล้ว กรุณารีเฟรชหน้า");
    if (error instanceof ChangeRequestError) return fail("กรุณาตรวจสอบข้อมูล", error.fieldErrors);
    console.error("License change request failed", { requestId, error });
    return fail("ส่งกลับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  console.info("License changes requested", { requestId, adminId: admin.id });
  revalidateRequests();
  return ok(undefined, "ส่งกลับให้ลูกค้าแล้ว");
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
