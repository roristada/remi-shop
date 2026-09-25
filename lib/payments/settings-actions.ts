"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { uploadRequestSchema } from "@/lib/validation/product";
import { BUCKETS } from "@/lib/storage/buckets";
import { checkFileMeta, FILE_TYPE_ERROR_TH, getExtension, IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import { createSignedUpload, removeObjects, verifyUploadedObject, type SignedUpload } from "@/lib/storage/product-storage";
import { isQrImagePath, newQrImagePath } from "@/lib/storage/payment-storage";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `ไม่เกิน ${max} ตัวอักษร`)
    .transform((v) => (v === "" ? null : v));

const paymentSettingsSchema = z.object({
  promptPayName: z.string().trim().max(100, "ไม่เกิน 100 ตัวอักษร"),
  // Phone (10 digits), citizen/tax ID (13) or e-wallet (15); dashes and spaces are allowed for readability.
  promptPayNumber: z
    .string()
    .trim()
    .refine((v) => v === "" || /^(\d[\d -]*\d)$/.test(v), "ใช้ได้เฉพาะตัวเลข ขีด และเว้นวรรค")
    .refine((v) => v === "" || [10, 13, 15].includes(v.replace(/\D/g, "").length), "ต้องเป็นเบอร์โทร 10 หลัก, เลขประจำตัว 13 หลัก หรือ e-Wallet 15 หลัก"),
  instructionsTH: optionalText(1000),
  instructionsEN: optionalText(1000),
});

function revalidatePaymentInfo() {
  revalidatePath("/admin/settings");
  revalidatePath("/[locale]/orders/[orderNumber]", "page");
}

export async function updatePaymentSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = paymentSettingsSchema.safeParse({
    promptPayName: formString(formData, "promptPayName"),
    promptPayNumber: formString(formData, "promptPayNumber"),
    instructionsTH: formString(formData, "instructionsTH"),
    instructionsEN: formString(formData, "instructionsEN"),
  });
  if (!parsed.success) return invalid(parsed.error);

  await prisma.paymentSetting.upsert({ where: { id: 1 }, create: { id: 1, ...parsed.data }, update: parsed.data });
  revalidatePaymentInfo();
  return ok(undefined, "บันทึกช่องทางชำระเงินแล้ว");
}

export async function requestQrUpload(input: { fileName: string; size: number }): Promise<ActionResult<SignedUpload>> {
  await requireAdmin();
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return fail("คำขอไม่ถูกต้อง");
  const typeError = checkFileMeta(IMAGE_FILE_TYPES, parsed.data.fileName, parsed.data.size);
  if (typeError) return fail(FILE_TYPE_ERROR_TH[typeError]);

  const upload = await createSignedUpload(BUCKETS.productPreviews, newQrImagePath(parsed.data.fileName));
  return upload ? ok(upload) : fail("เริ่มอัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

/** Replaces the PromptPay QR image; the previous image is deleted after the switch. */
export async function confirmQrUpload(input: { path: string; fileName: string }): Promise<ActionResult> {
  await requireAdmin();
  if (typeof input?.path !== "string" || !isQrImagePath(input.path)) return fail("คำขอไม่ถูกต้อง");
  if (getExtension(input.path) !== getExtension(input.fileName)) {
    await removeObjects(BUCKETS.productPreviews, [input.path]);
    return fail("คำขอไม่ถูกต้อง");
  }

  const verified = await verifyUploadedObject(BUCKETS.productPreviews, input.path, input.fileName);
  if (!verified.ok) {
    return fail(verified.error === "not_found" ? "ไม่พบไฟล์ที่อัปโหลด" : FILE_TYPE_ERROR_TH[verified.error]);
  }

  const previous = await prisma.paymentSetting.findUnique({ where: { id: 1 }, select: { qrImagePath: true } });
  await prisma.paymentSetting.upsert({
    where: { id: 1 },
    create: { id: 1, qrImagePath: input.path },
    update: { qrImagePath: input.path },
  });
  if (previous?.qrImagePath && previous.qrImagePath !== input.path) {
    await removeObjects(BUCKETS.productPreviews, [previous.qrImagePath]);
  }
  revalidatePaymentInfo();
  return ok(undefined);
}

export async function removeQrImage(): Promise<ActionResult> {
  await requireAdmin();
  const previous = await prisma.paymentSetting.findUnique({ where: { id: 1 }, select: { qrImagePath: true } });
  if (!previous?.qrImagePath) return ok(undefined);
  await prisma.paymentSetting.update({ where: { id: 1 }, data: { qrImagePath: null } });
  await removeObjects(BUCKETS.productPreviews, [previous.qrImagePath]);
  revalidatePaymentInfo();
  return ok(undefined, "ลบรูป QR แล้ว");
}
