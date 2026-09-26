"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isNotFound, isUniqueViolation } from "@/lib/prisma/errors";
import { fail, formString, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { folderSchema, idSchema, MAX_REORDER_ITEMS } from "@/lib/validation/product";
import { revalidateCatalog } from "@/lib/products/revalidate";

const idListSchema = z.array(idSchema).min(1).max(MAX_REORDER_ITEMS);

function parseIdList(ids: unknown): string[] | null {
  const parsed = idListSchema.safeParse(ids);
  if (!parsed.success || new Set(parsed.data).size !== parsed.data.length) return null;
  return parsed.data;
}

function writeError(error: unknown, context: string): ActionResult {
  if (isUniqueViolation(error)) return fail("slug นี้ถูกใช้แล้ว", { slug: "slug นี้ถูกใช้แล้ว" });
  if (isNotFound(error)) return fail("ไม่พบโฟลเดอร์");
  console.error(`[folders] ${context} failed`, { message: (error as Error).message });
  return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
}

export async function saveFolder(
  folderId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  if (folderId !== null && !idSchema.safeParse(folderId).success) return fail("ไม่พบโฟลเดอร์");
  const parsed = folderSchema.safeParse({
    slug: formString(formData, "slug"),
    nameTH: formString(formData, "nameTH"),
    nameEN: formString(formData, "nameEN"),
    status: formString(formData, "status") || "ACTIVE",
  });
  if (!parsed.success) return invalid(parsed.error);

  try {
    if (folderId) {
      await prisma.folder.update({ where: { id: folderId }, data: parsed.data });
    } else {
      // New folders go to the end of the list.
      const last = await prisma.folder.aggregate({ _max: { sortOrder: true } });
      await prisma.folder.create({ data: { ...parsed.data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    }
  } catch (error) {
    return writeError(error, folderId ? "update" : "create");
  }

  revalidateCatalog();
  return ok(undefined, folderId ? "บันทึกโฟลเดอร์แล้ว" : "เพิ่มโฟลเดอร์แล้ว");
}

/** Products in the folder are kept and become unfiled (FK ON DELETE SET NULL). */
export async function deleteFolder(folderId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(folderId).success) return fail("ไม่พบโฟลเดอร์");

  try {
    await prisma.folder.delete({ where: { id: folderId } });
  } catch (error) {
    return writeError(error, "delete");
  }

  console.info("[folders] deleted", { folderId });
  revalidateCatalog();
  return ok(undefined, "ลบโฟลเดอร์แล้ว สินค้าย้ายไป “ไม่มีโฟลเดอร์”");
}

export async function reorderFolders(orderedIds: string[]): Promise<ActionResult> {
  await requireAdmin();
  const ids = parseIdList(orderedIds);
  if (!ids) return fail("คำขอไม่ถูกต้อง");

  const current = await prisma.folder.findMany({ select: { id: true } });
  const known = new Set(current.map((f) => f.id));
  if (current.length !== ids.length || !ids.every((id) => known.has(id))) {
    return fail("รายการโฟลเดอร์เปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
  }

  await prisma.$transaction(ids.map((id, sortOrder) => prisma.folder.update({ where: { id }, data: { sortOrder } })));

  revalidateCatalog();
  return ok(undefined, "บันทึกลำดับโฟลเดอร์แล้ว");
}

export async function reorderFolderProducts(folderId: string, orderedIds: string[]): Promise<ActionResult> {
  await requireAdmin();
  const ids = parseIdList(orderedIds);
  if (!idSchema.safeParse(folderId).success || !ids) return fail("คำขอไม่ถูกต้อง");

  const current = await prisma.product.findMany({ where: { folderId }, select: { id: true } });
  const known = new Set(current.map((p) => p.id));
  if (current.length !== ids.length || !ids.every((id) => known.has(id))) {
    return fail("รายการสินค้าในโฟลเดอร์เปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
  }

  // `folderId` in the filter guards against a product moved out concurrently.
  await prisma.$transaction(
    ids.map((id, folderSortOrder) => prisma.product.updateMany({ where: { id, folderId }, data: { folderSortOrder } })),
  );

  revalidateCatalog();
  return ok(undefined, "บันทึกลำดับสินค้าแล้ว");
}

/** Moves products (from no folder or another folder) to the end of `folderId`. */
export async function addProductsToFolder(folderId: string, productIds: string[]): Promise<ActionResult> {
  await requireAdmin();
  const ids = parseIdList(productIds);
  if (!idSchema.safeParse(folderId).success || !ids) return fail("คำขอไม่ถูกต้อง");

  try {
    await prisma.$transaction(async (tx) => {
      const folder = await tx.folder.findUnique({ where: { id: folderId }, select: { id: true } });
      if (!folder) throw new FolderMissingError();
      const last = await tx.product.aggregate({ where: { folderId }, _max: { folderSortOrder: true } });
      const start = (last._max.folderSortOrder ?? -1) + 1;
      for (const [i, id] of ids.entries()) {
        await tx.product.update({ where: { id }, data: { folderId, folderSortOrder: start + i } });
      }
    });
  } catch (error) {
    if (error instanceof FolderMissingError) return fail("ไม่พบโฟลเดอร์");
    if (isNotFound(error)) return fail("ไม่พบสินค้าบางรายการ กรุณาโหลดหน้าใหม่");
    return writeError(error, "add products");
  }

  revalidateCatalog();
  return ok(undefined, ids.length === 1 ? "ย้ายสินค้าเข้าโฟลเดอร์แล้ว" : `ย้ายสินค้า ${ids.length} รายการเข้าโฟลเดอร์แล้ว`);
}

export async function removeProductFromFolder(productId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success) return fail("ไม่พบสินค้า");

  try {
    await prisma.product.update({ where: { id: productId }, data: { folderId: null, folderSortOrder: 0 } });
  } catch (error) {
    return writeError(error, "remove product");
  }

  revalidateCatalog();
  return ok(undefined, "นำสินค้าออกจากโฟลเดอร์แล้ว");
}

class FolderMissingError extends Error {}
