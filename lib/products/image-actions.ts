"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isUniqueViolation } from "@/lib/prisma/errors";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema, uploadRequestSchema } from "@/lib/validation/product";
import { BUCKETS } from "@/lib/storage/buckets";
import { MAX_PRODUCT_FILE_SIZE } from "@/lib/storage/buckets";
import { checkFileMeta, FILE_TYPE_ERROR_TH, getExtension, PRODUCT_IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import {
  createSignedUpload,
  isProductImagePath,
  newProductImagePath,
  removeObjects,
  verifyUploadedObject,
  type SignedUpload,
} from "@/lib/storage/product-storage";
import { revalidateCatalog } from "@/lib/products/revalidate";
import { optimizePreviewImage, previewObjectPaths } from "@/lib/storage/image-optimize";

const MAX_IMAGES_PER_PRODUCT = 20;

export async function requestImageUpload(
  productId: string,
  input: { fileName: string; size: number },
): Promise<ActionResult<SignedUpload>> {
  await requireAdmin();
  const parsed = uploadRequestSchema.safeParse(input);
  if (!idSchema.safeParse(productId).success || !parsed.success) return fail("คำขอไม่ถูกต้อง");

  const typeError = checkFileMeta(PRODUCT_IMAGE_FILE_TYPES, parsed.data.fileName, parsed.data.size, MAX_PRODUCT_FILE_SIZE);
  if (typeError) return fail(FILE_TYPE_ERROR_TH[typeError]);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { _count: { select: { images: true } } },
  });
  if (!product) return fail("ไม่พบสินค้า");
  if (product._count.images >= MAX_IMAGES_PER_PRODUCT) return fail(`รูปภาพได้สูงสุด ${MAX_IMAGES_PER_PRODUCT} รูป`);

  const upload = await createSignedUpload(BUCKETS.productPreviews, newProductImagePath(productId, parsed.data.fileName));
  return upload ? ok(upload) : fail("เริ่มอัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

/**
 * Records a verified upload as the product's last image, then stores optimized WebP copies.
 * The row is created first, so if optimizing fails or runs out of time the original still shows.
 */
export async function confirmImageUpload(
  productId: string,
  input: { path: string; fileName: string },
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("คำขอไม่ถูกต้อง");
  // The path must be one we issued for this product, with the extension the checks run against.
  if (!isProductImagePath(input.path, productId)) return fail("คำขอไม่ถูกต้อง");
  if (getExtension(input.path) !== getExtension(input.fileName)) {
    // The key is one we issued for this product, so the uploaded object is safe to discard.
    await removeObjects(BUCKETS.productPreviews, [input.path]);
    return fail("คำขอไม่ถูกต้อง");
  }

  const verified = await verifyUploadedObject(BUCKETS.productPreviews, input.path, input.fileName);
  if (!verified.ok) {
    return fail(verified.error === "not_found" ? "ไม่พบไฟล์ที่อัปโหลด" : FILE_TYPE_ERROR_TH[verified.error]);
  }

  let id: string;
  try {
    id = await prisma.$transaction(async (tx) => {
      const [primaryCount, max] = await Promise.all([
        tx.productImage.count({ where: { productId, isPrimary: true } }),
        tx.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } }),
      ]);
      const image = await tx.productImage.create({
        data: {
          productId,
          imagePath: input.path,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
          isPrimary: primaryCount === 0,
        },
        select: { id: true },
      });
      return image.id;
    });
  } catch (error) {
    await removeObjects(BUCKETS.productPreviews, [input.path]);
    if (isUniqueViolation(error)) return fail("อัปโหลดพร้อมกันหลายรูป กรุณาลองใหม่อีกครั้ง");
    console.error("[products] image create failed", { productId, message: (error as Error).message });
    return fail("บันทึกรูปไม่สำเร็จ");
  }

  const optimized = await optimizePreviewImage(input.path);
  if (optimized) {
    await prisma.productImage.update({
      where: { id },
      data: { cardPath: optimized.card ?? null, detailPath: optimized.detail ?? null },
    });
  }

  revalidateCatalog();
  return ok({ id }, "อัปโหลดรูปแล้ว");
}

/**
 * Applies the editor's image changes at once: removes `deleteIds`, then saves `orderedIds` as
 * the new order. The first image is always the primary (shown on cards and first in the gallery).
 */
export async function saveImageChanges(
  productId: string,
  changes: { orderedIds: string[]; deleteIds: string[] },
): Promise<ActionResult> {
  await requireAdmin();
  const ordered = z.array(idSchema).max(MAX_IMAGES_PER_PRODUCT).safeParse(changes?.orderedIds);
  const deletes = z.array(idSchema).max(MAX_IMAGES_PER_PRODUCT).safeParse(changes?.deleteIds ?? []);
  if (!idSchema.safeParse(productId).success || !ordered.success || !deletes.success) return fail("คำขอไม่ถูกต้อง");
  if (new Set(ordered.data).size !== ordered.data.length) return fail("คำขอไม่ถูกต้อง");

  const current = await prisma.productImage.findMany({
    where: { productId },
    select: { id: true, imagePath: true, cardPath: true, detailPath: true },
  });
  const known = new Set(current.map((i) => i.id));
  const removed = current.filter((i) => deletes.data.includes(i.id));
  const kept = current.filter((i) => !deletes.data.includes(i.id));
  if (!deletes.data.every((id) => known.has(id))) return fail("รายการรูปเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
  if (kept.length !== ordered.data.length || !kept.every((i) => ordered.data.includes(i.id))) {
    return fail("รายการรูปเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
  }

  try {
    await prisma.$transaction([
      prisma.productImage.deleteMany({ where: { id: { in: removed.map((i) => i.id) }, productId } }),
      // One primary per product (partial unique index): clear first, then mark the new first image.
      prisma.productImage.updateMany({ where: { productId, isPrimary: true }, data: { isPrimary: false } }),
      ...ordered.data.map((id, sortOrder) =>
        prisma.productImage.update({ where: { id }, data: { sortOrder, isPrimary: sortOrder === 0 } }),
      ),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) return fail("มีการแก้ไขพร้อมกัน กรุณาลองใหม่อีกครั้ง");
    throw error;
  }
  if (removed.length > 0) {
    await removeObjects(BUCKETS.productPreviews, removed.flatMap(previewObjectPaths));
  }

  revalidateCatalog();
  return ok(undefined, "บันทึกรูปแล้ว");
}
