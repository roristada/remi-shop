"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { categorySchema, idSchema, uploadRequestSchema } from "@/lib/validation/product";
import { revalidateCatalog } from "@/lib/products/revalidate";
import { BUCKETS } from "@/lib/storage/buckets";
import { checkFileMeta, FILE_TYPE_ERROR_TH, getExtension, IMAGE_FILE_TYPES } from "@/lib/storage/file-types";
import { createSignedUpload, removeObjects, verifyUploadedObject, type SignedUpload } from "@/lib/storage/product-storage";
import { isCategoryImagePath, newCategoryImagePath } from "@/lib/categories/paths";

function parseCategoryForm(formData: FormData) {
  return categorySchema.safeParse({
    slug: formString(formData, "slug"),
    nameTH: formString(formData, "nameTH"),
    nameEN: formString(formData, "nameEN"),
    descriptionTH: formString(formData, "descriptionTH"),
    descriptionEN: formString(formData, "descriptionEN"),
    status: formString(formData, "status"),
    sortOrder: formString(formData, "sortOrder") || "0",
    iconKey: formString(formData, "iconKey"),
  });
}

function writeError(error: unknown, context: string): ActionResult {
  if (isUniqueViolation(error)) return fail("slug นี้ถูกใช้แล้ว", { slug: "slug นี้ถูกใช้แล้ว" });
  if (isNotFound(error)) return fail("ไม่พบหมวดหมู่");
  console.error(`[categories] ${context} failed`, { message: (error as Error).message });
  return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

export async function saveCategory(
  categoryId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (categoryId !== null && !idSchema.safeParse(categoryId).success) return fail("ไม่พบหมวดหมู่");
  const parsed = parseCategoryForm(formData);
  if (!parsed.success) return invalid(parsed.error);

  try {
    if (categoryId) await prisma.category.update({ where: { id: categoryId }, data: parsed.data });
    else await prisma.category.create({ data: parsed.data });
  } catch (error) {
    return writeError(error, categoryId ? "update" : "create");
  }

  revalidateCatalog();
  return ok(undefined, categoryId ? "บันทึกหมวดหมู่แล้ว" : "เพิ่มหมวดหมู่แล้ว");
}

/** Categories with products cannot be deleted (FK Restrict) — hide them instead. */
export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(categoryId).success) return fail("ไม่พบหมวดหมู่");

  let imagePath: string | null;
  try {
    ({ imagePath } = await prisma.category.delete({ where: { id: categoryId }, select: { imagePath: true } }));
  } catch (error) {
    if (isForeignKeyViolation(error)) return fail("หมวดหมู่นี้มีสินค้าอยู่ ลบไม่ได้ — ใช้ “ซ่อน” แทน");
    return writeError(error, "delete");
  }
  if (imagePath) await removeObjects(BUCKETS.productPreviews, [imagePath]);

  revalidateCatalog();
  return ok(undefined, "ลบหมวดหมู่แล้ว");
}

export async function requestCategoryImageUpload(id: string, input: { fileName: string; size: number }): Promise<ActionResult<SignedUpload>> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return fail("คำขอไม่ถูกต้อง");
  const typeError = checkFileMeta(IMAGE_FILE_TYPES, parsed.data.fileName, parsed.data.size);
  if (typeError) return fail(FILE_TYPE_ERROR_TH[typeError]);

  const upload = await createSignedUpload(BUCKETS.productPreviews, newCategoryImagePath(id, parsed.data.fileName));
  return upload ? ok(upload) : fail("เริ่มอัปโหลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

/** Sets the category's own icon picture after checking the stored object; the previous one is deleted. */
export async function confirmCategoryImageUpload(id: string, input: { path: string; fileName: string }): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof input?.path !== "string" || !isCategoryImagePath(id, input.path)) {
    return fail("คำขอไม่ถูกต้อง");
  }
  if (getExtension(input.path) !== getExtension(input.fileName)) {
    await removeObjects(BUCKETS.productPreviews, [input.path]);
    return fail("คำขอไม่ถูกต้อง");
  }
  const verified = await verifyUploadedObject(BUCKETS.productPreviews, input.path, input.fileName);
  if (!verified.ok) return fail(verified.error === "not_found" ? "ไม่พบไฟล์ที่อัปโหลด" : FILE_TYPE_ERROR_TH[verified.error]);

  const previous = await prisma.category.findUnique({ where: { id }, select: { imagePath: true } });
  if (!previous) {
    await removeObjects(BUCKETS.productPreviews, [input.path]);
    return fail("ไม่พบหมวดหมู่");
  }
  await prisma.category.update({ where: { id }, data: { imagePath: input.path } });
  if (previous.imagePath && previous.imagePath !== input.path) await removeObjects(BUCKETS.productPreviews, [previous.imagePath]);
  revalidateCatalog();
  return ok(undefined);
}

/** Back to the drawn icon. */
export async function removeCategoryImage(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return fail("คำขอไม่ถูกต้อง");
  const category = await prisma.category.findUnique({ where: { id }, select: { imagePath: true } });
  if (!category?.imagePath) return ok(undefined);
  await prisma.category.update({ where: { id }, data: { imagePath: null } });
  await removeObjects(BUCKETS.productPreviews, [category.imagePath]);
  revalidateCatalog();
  return ok(undefined, "ลบรูปแล้ว กลับไปใช้ไอคอนวาด");
}
