"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { isForeignKeyViolation, isNotFound } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema, uploadRequestSchema, variantSchema, type VariantInput } from "@/lib/validation/product";
import { revalidateCatalog } from "@/lib/products/revalidate";
import { BUCKETS, MAX_PRODUCT_FILE_SIZE } from "@/lib/storage/buckets";
import { checkFileMeta, FILE_TYPE_ERROR_TH, getExtension, PRODUCT_IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import {
  createSignedUpload,
  isVariantImagePath,
  newVariantImagePath,
  removeObjects,
  verifyUploadedObject,
  type SignedUpload,
} from "@/lib/storage/product-storage";

type Db = Prisma.TransactionClient | typeof prisma;

const MAX_VARIANTS_PER_PRODUCT = 30;

function parseVariantForm(formData: FormData) {
  return variantSchema.safeParse({
    nameTH: formString(formData, "nameTH"),
    nameEN: formString(formData, "nameEN"),
    price: formString(formData, "price"),
    discountPercent: formString(formData, "discountPercent"),
    discountStartAt: formString(formData, "discountStartAt"),
    discountEndAt: formString(formData, "discountEndAt"),
    stockLimit: formString(formData, "stockLimit"),
    sortOrder: formString(formData, "sortOrder") || "0",
  });
}

function toVariantData(d: VariantInput) {
  return {
    nameTH: d.nameTH,
    nameEN: d.nameEN,
    price: d.price,
    discountPercent: d.discountPercent,
    discountStartAt: d.discountStartAt,
    discountEndAt: d.discountEndAt,
    stockLimit: d.stockLimit,
    sortOrder: d.sortOrder,
  };
}

/**
 * Keeps Product.price at the cheapest active variant's base price, so price sorting and the
 * price filters (which read Product.price) place a product with variants correctly.
 */
async function syncProductPrice(db: Db, productId: string) {
  const cheapest = await db.productVariant.findFirst({
    where: { productId, isActive: true },
    orderBy: { price: "asc" },
    select: { price: true },
  });
  if (cheapest) await db.product.update({ where: { id: productId }, data: { price: cheapest.price } });
}

export async function createVariant(
  productId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");
  const parsed = parseVariantForm(formData);
  if (!parsed.success) return invalid(parsed.error);

  const count = await prisma.productVariant.count({ where: { productId } });
  if (count >= MAX_VARIANTS_PER_PRODUCT) return fail(`ตัวเลือกได้สูงสุด ${MAX_VARIANTS_PER_PRODUCT} แบบต่อสินค้า`);

  let id: string;
  try {
    id = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({ data: { productId, ...toVariantData(parsed.data) }, select: { id: true } });
      await syncProductPrice(tx, productId);
      return variant.id;
    });
  } catch (error) {
    if (isForeignKeyViolation(error) || isNotFound(error)) return fail("ไม่พบสินค้า");
    console.error("[products] variant create failed", { productId, message: (error as Error).message });
    return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  console.info("[products] variant created", { productId });
  revalidateCatalog();
  return ok({ id }, "เพิ่มตัวเลือกแล้ว");
}

export async function updateVariant(
  variantId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(variantId).success) return fail("ไม่พบตัวเลือก");
  const parsed = parseVariantForm(formData);
  if (!parsed.success) return invalid(parsed.error);

  try {
    await prisma.$transaction(async (tx) => {
      // Past orders keep their own snapshot of name and price, so editing is always safe.
      const variant = await tx.productVariant.update({
        where: { id: variantId },
        data: toVariantData(parsed.data),
        select: { productId: true },
      });
      await syncProductPrice(tx, variant.productId);
    });
  } catch (error) {
    if (isNotFound(error)) return fail("ไม่พบตัวเลือก");
    console.error("[products] variant update failed", { variantId, message: (error as Error).message });
    return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  revalidateCatalog();
  return ok(undefined, "บันทึกตัวเลือกแล้ว");
}

/** Switching a variant off stops new sales only; buyers keep its files. */
export async function setVariantActive(variantId: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(variantId).success) return fail("ไม่พบตัวเลือก");
  try {
    await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.update({
        where: { id: variantId },
        data: { isActive: isActive === true },
        select: { productId: true },
      });
      await syncProductPrice(tx, variant.productId);
    });
  } catch (error) {
    if (isNotFound(error)) return fail("ไม่พบตัวเลือก");
    throw error;
  }
  revalidateCatalog();
  return ok(undefined, isActive ? "เปิดขายตัวเลือกแล้ว" : "ปิดขายตัวเลือกแล้ว");
}

/**
 * Only a variant that was never ordered and has no files can be deleted (the foreign keys
 * restrict it). Otherwise it must be switched off, so past buyers keep their files.
 */
export async function deleteVariant(variantId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(variantId).success) return fail("ไม่พบตัวเลือก");
  let removedImage: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.delete({ where: { id: variantId }, select: { productId: true, imagePath: true } });
      removedImage = variant.imagePath;
      await syncProductPrice(tx, variant.productId);
    });
  } catch (error) {
    if (isNotFound(error)) return fail("ไม่พบตัวเลือก");
    if (isForeignKeyViolation(error)) {
      return fail("ตัวเลือกนี้มีคำสั่งซื้อหรือไฟล์แล้ว จึงลบไม่ได้ ให้ปิดขายแทน หรือย้ายไฟล์ออกก่อน");
    }
    throw error;
  }
  if (removedImage) await removeObjects(BUCKETS.productPreviews, [removedImage]);
  console.info("[products] variant deleted", { variantId });
  revalidateCatalog();
  return ok(undefined, "ลบตัวเลือกแล้ว");
}

// ─────────────────────────── Option picture ───────────────────────────

async function findVariant(variantId: string) {
  if (!idSchema.safeParse(variantId).success) return null;
  return prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true, productId: true, imagePath: true } });
}

export async function requestVariantImageUpload(
  variantId: string,
  input: { fileName: string; size: number },
): Promise<ActionResult<SignedUpload>> {
  await requireAdmin();
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return fail("คำขอไม่ถูกต้อง");
  const typeError = checkFileMeta(PRODUCT_IMAGE_FILE_TYPES, parsed.data.fileName, parsed.data.size, MAX_PRODUCT_FILE_SIZE);
  if (typeError) return fail(FILE_TYPE_ERROR_TH[typeError]);
  const variant = await findVariant(variantId);
  if (!variant) return fail("ไม่พบตัวเลือก");
  const upload = await createSignedUpload(BUCKETS.productPreviews, newVariantImagePath(variant.productId, parsed.data.fileName));
  return upload ? ok(upload) : fail("เริ่มอัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

/** Verifies the uploaded picture, makes it the option's picture and drops the old one. */
export async function confirmVariantImage(variantId: string, input: { path: string; fileName: string }): Promise<ActionResult> {
  await requireAdmin();
  const variant = await findVariant(variantId);
  if (!variant) return fail("ไม่พบตัวเลือก");
  if (!isVariantImagePath(input.path, variant.productId) || getExtension(input.path) !== getExtension(input.fileName)) {
    return fail("คำขอไม่ถูกต้อง");
  }
  const verified = await verifyUploadedObject(BUCKETS.productPreviews, input.path, input.fileName);
  if (!verified.ok) return fail(verified.error === "not_found" ? "ไม่พบไฟล์ที่อัปโหลด" : FILE_TYPE_ERROR_TH[verified.error]);

  // A card-size copy replaces it afterwards (lib/products/image-jobs.ts).
  await prisma.productVariant.update({ where: { id: variant.id }, data: { imagePath: input.path } });
  if (variant.imagePath) await removeObjects(BUCKETS.productPreviews, [variant.imagePath]);
  revalidateCatalog();
  return ok(undefined, "บันทึกรูปตัวเลือกแล้ว");
}

export async function removeVariantImage(variantId: string): Promise<ActionResult> {
  await requireAdmin();
  const variant = await findVariant(variantId);
  if (!variant) return fail("ไม่พบตัวเลือก");
  if (!variant.imagePath) return ok(undefined);
  await prisma.productVariant.update({ where: { id: variant.id }, data: { imagePath: null } });
  await removeObjects(BUCKETS.productPreviews, [variant.imagePath]);
  revalidateCatalog();
  return ok(undefined, "ลบรูปตัวเลือกแล้ว");
}
