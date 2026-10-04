"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation, isNotFound, isUniqueViolation } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema } from "@/lib/validation/product";
import { expireCatalogCache } from "@/lib/products/revalidate";

// Admin is Thai-only, so messages are Thai strings.

const softwareTagSchema = z.object({
  name: z.string().trim().min(1, "กรุณากรอกข้อมูล").max(80, "ไม่เกิน 80 ตัวอักษร"),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true"),
  sortOrder: z.coerce.number().int("ต้องเป็นจำนวนเต็ม").min(0).max(9999),
});

function revalidateSoftwareTags() {
  expireCatalogCache(); // Tag names are part of the cached product row.
  revalidatePath("/admin/products", "layout");
  revalidatePath("/[locale]/shop", "layout");
  revalidatePath("/[locale]/product/[slug]", "layout");
}

export async function saveSoftwareTag(
  tagId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (tagId !== null && !idSchema.safeParse(tagId).success) return fail("ไม่พบโปรแกรม");
  const parsed = softwareTagSchema.safeParse({
    name: formString(formData, "name"),
    isActive: formString(formData, "isActive") || "true",
    sortOrder: formString(formData, "sortOrder") || "0",
  });
  if (!parsed.success) return invalid(parsed.error);

  try {
    if (tagId) await prisma.softwareTag.update({ where: { id: tagId }, data: parsed.data });
    else await prisma.softwareTag.create({ data: parsed.data });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("ชื่อโปรแกรมนี้มีอยู่แล้ว", { name: "ชื่อโปรแกรมนี้มีอยู่แล้ว" });
    if (isNotFound(error)) return fail("ไม่พบโปรแกรม");
    console.error("[software-tags] save failed", { message: (error as Error).message });
    return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  revalidateSoftwareTags();
  return ok(undefined, tagId ? "บันทึกโปรแกรมแล้ว" : "เพิ่มโปรแกรมแล้ว");
}

/** Tags already used by a product cannot be deleted (FK Restrict-like via count check): deactivate instead. */
export async function deleteSoftwareTag(tagId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(tagId).success) return fail("ไม่พบโปรแกรม");
  try {
    await prisma.softwareTag.delete({ where: { id: tagId } });
  } catch (error) {
    if (isForeignKeyViolation(error)) return fail("โปรแกรมนี้ถูกใช้กับสินค้าอยู่ ลบไม่ได้ ใช้ “ปิดใช้งาน” แทน");
    if (isNotFound(error)) return fail("ไม่พบโปรแกรม");
    console.error("[software-tags] delete failed", { message: (error as Error).message });
    return fail("ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  revalidateSoftwareTags();
  return ok(undefined, "ลบโปรแกรมแล้ว");
}
