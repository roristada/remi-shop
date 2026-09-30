"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isUniqueViolation } from "@/lib/prisma/errors";
import { fail, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema, imageAltSchema, uploadRequestSchema } from "@/lib/validation/product";
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

export async function confirmImageUpload(
  productId: string,
  input: { path: string; fileName: string },
): Promise<ActionResult> {
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

  try {
    await prisma.$transaction(async (tx) => {
      const [primaryCount, max] = await Promise.all([
        tx.productImage.count({ where: { productId, isPrimary: true } }),
        tx.productImage.aggregate({ where: { productId }, _max: { sortOrder: true } }),
      ]);
      await tx.productImage.create({
        data: {
          productId,
          imagePath: input.path,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
          isPrimary: primaryCount === 0,
        },
      });
    });
  } catch (error) {
    await removeObjects(BUCKETS.productPreviews, [input.path]);
    if (isUniqueViolation(error)) return fail("อัปโหลดพร้อมกันหลายรูป กรุณาลองใหม่อีกครั้ง");
    console.error("[products] image create failed", { productId, message: (error as Error).message });
    return fail("บันทึกรูปไม่สำเร็จ");
  }

  revalidateCatalog();
  return ok(undefined, "อัปโหลดรูปแล้ว");
}

async function findImage(imageId: string) {
  if (!idSchema.safeParse(imageId).success) return null;
  return prisma.productImage.findUnique({ where: { id: imageId } });
}

export async function setPrimaryImage(imageId: string): Promise<ActionResult> {
  await requireAdmin();
  const image = await findImage(imageId);
  if (!image) return fail("ไม่พบรูปภาพ");

  try {
    await prisma.$transaction([
      prisma.productImage.updateMany({
        where: { productId: image.productId, isPrimary: true },
        data: { isPrimary: false },
      }),
      prisma.productImage.update({ where: { id: image.id }, data: { isPrimary: true } }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) return fail("มีการแก้ไขพร้อมกัน กรุณาลองใหม่อีกครั้ง");
    throw error;
  }

  revalidateCatalog();
  return ok(undefined, "ตั้งเป็นรูปหลักแล้ว");
}

/** Saves a full new order. The id list must be exactly this product's images. */
export async function reorderImages(productId: string, orderedIds: string[]): Promise<ActionResult> {
  await requireAdmin();
  const ids = z.array(idSchema).max(MAX_IMAGES_PER_PRODUCT).safeParse(orderedIds);
  if (!idSchema.safeParse(productId).success || !ids.success || new Set(ids.data).size !== ids.data.length) {
    return fail("คำขอไม่ถูกต้อง");
  }

  const current = await prisma.productImage.findMany({ where: { productId }, select: { id: true } });
  const known = new Set(current.map((i) => i.id));
  if (current.length !== ids.data.length || !ids.data.every((id) => known.has(id))) {
    return fail("รายการรูปเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
  }

  await prisma.$transaction(
    ids.data.map((id, sortOrder) => prisma.productImage.update({ where: { id }, data: { sortOrder } })),
  );

  revalidateCatalog();
  return ok(undefined, "บันทึกลำดับรูปแล้ว");
}

export async function updateImageAlt(
  imageId: string,
  input: { altTextTH: string; altTextEN: string },
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = imageAltSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const image = await findImage(imageId);
  if (!image) return fail("ไม่พบรูปภาพ");

  await prisma.productImage.update({ where: { id: image.id }, data: parsed.data });
  revalidateCatalog();
  return ok(undefined, "บันทึกคำอธิบายรูปแล้ว");
}

export async function deleteImage(imageId: string): Promise<ActionResult> {
  await requireAdmin();
  const image = await findImage(imageId);
  if (!image) return fail("ไม่พบรูปภาพ");

  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: image.id } });
    if (!image.isPrimary) return;
    // Promote the next image so the product keeps a primary.
    const next = await tx.productImage.findFirst({
      where: { productId: image.productId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (next) await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
  });
  await removeObjects(BUCKETS.productPreviews, [image.imagePath]);

  revalidateCatalog();
  return ok(undefined, "ลบรูปแล้ว");
}
