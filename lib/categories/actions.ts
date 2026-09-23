"use server";

import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { categorySchema, idSchema } from "@/lib/validation/product";
import { revalidateCatalog } from "@/lib/products/revalidate";

function parseCategoryForm(formData: FormData) {
  return categorySchema.safeParse({
    slug: formString(formData, "slug"),
    nameTH: formString(formData, "nameTH"),
    nameEN: formString(formData, "nameEN"),
    descriptionTH: formString(formData, "descriptionTH"),
    descriptionEN: formString(formData, "descriptionEN"),
    status: formString(formData, "status"),
    sortOrder: formString(formData, "sortOrder") || "0",
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

  try {
    await prisma.category.delete({ where: { id: categoryId } });
  } catch (error) {
    if (isForeignKeyViolation(error)) return fail("หมวดหมู่นี้มีสินค้าอยู่ ลบไม่ได้ — ใช้ “ซ่อน” แทน");
    return writeError(error, "delete");
  }

  revalidateCatalog();
  return ok(undefined, "ลบหมวดหมู่แล้ว");
}
