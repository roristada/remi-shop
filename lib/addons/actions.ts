"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema } from "@/lib/validation/product";
import { cleanAddonIds, MAX_ADDON_MAINS, MAX_ADDONS } from "@/lib/addons/rules";
import { revalidateCatalog } from "@/lib/products/revalidate";

export type AddonEditorInput = { enabled: boolean; addonIds: string[]; addonOnly: boolean; mainIds: string[] };

/**
 * Saves the product's add-on tab. A normal product: its add-on list (in the given order) and
 * on/off switch. An add-on-only product: the main products that sell it (rows of the same
 * ProductAddon table, from the other side); those mains get their add-on box switched on.
 * Only products without variants can be add-ons: the add-on box has no option picker.
 */
export async function saveProductAddons(productId: string, input: AddonEditorInput): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success || typeof input?.enabled !== "boolean" || typeof input?.addonOnly !== "boolean") {
    return fail("คำขอไม่ถูกต้อง");
  }
  if (input.addonOnly) return saveAddonOnly(productId, input.mainIds);
  const addonIds = cleanAddonIds(productId, input.addonIds);
  if (!addonIds) return fail("รายการ Add-on ไม่ถูกต้อง (สูงสุด 12 รายการ)");

  const found = await prisma.product.findMany({
    where: { id: { in: addonIds }, variants: { none: {} } },
    select: { id: true },
  });
  if (found.length !== addonIds.length) return fail("สินค้าบางรายการถูกลบหรือมีตัวเลือกแล้ว ใช้เป็น Add-on ไม่ได้ กรุณารีเฟรชหน้า");

  try {
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { addonsEnabled: input.enabled, addonOnly: false } }),
      prisma.productAddon.deleteMany({ where: { productId } }),
      prisma.productAddon.createMany({ data: addonIds.map((addonProductId, i) => ({ productId, addonProductId, sortOrder: i })) }),
    ]);
  } catch (error) {
    console.error("[addons] save failed", { productId, message: (error as Error).message });
    return fail("บันทึก Add-on ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  console.info("[addons] saved", { productId, enabled: input.enabled, count: addonIds.length });
  revalidateAddons(productId);
  return ok(undefined);
}

function revalidateAddons(productId: string) {
  revalidatePath(`/admin/products/${productId}`);
  // Cards carry the "Add-on" tag and the detail page is cached with the catalog.
  revalidateCatalog();
}

/** Marks the product add-on-only and sets the main products that sell it (replacing the previous ones). */
async function saveAddonOnly(productId: string, mainInput: unknown): Promise<ActionResult> {
  const mainIds = cleanAddonIds(productId, mainInput, MAX_ADDON_MAINS);
  if (!mainIds) return fail("รายการสินค้าหลักไม่ถูกต้อง");
  if (mainIds.length === 0) return fail("เลือกสินค้าหลักอย่างน้อย 1 รายการ ไม่เช่นนั้นลูกค้าจะซื้อ Add-on นี้ไม่ได้เลย");

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { _count: { select: { variants: true } } } });
  if (!product) return fail("ไม่พบสินค้านี้");
  if (product._count.variants > 0) return fail("สินค้าที่มีตัวเลือกขายเป็น Add-on ไม่ได้");

  const mains = await prisma.product.findMany({
    where: { id: { in: mainIds }, addonOnly: false },
    select: { id: true, nameTH: true, _count: { select: { addons: { where: { addonProductId: { not: productId } } } } } },
  });
  if (mains.length !== mainIds.length) return fail("สินค้าหลักบางรายการถูกลบหรือเป็น Add-on เท่านั้น กรุณารีเฟรชหน้า");
  const full = mains.find((m) => m._count.addons >= MAX_ADDONS);
  if (full) return fail(`"${full.nameTH}" มี Add-on ครบ ${MAX_ADDONS} รายการแล้ว`);

  try {
    await prisma.$transaction(async (tx) => {
      // An add-on-only product does not offer add-ons of its own.
      await tx.product.update({ where: { id: productId }, data: { addonOnly: true, addonsEnabled: false } });
      await tx.productAddon.deleteMany({ where: { addonProductId: productId, productId: { notIn: mainIds } } });
      const existing = new Set(
        (await tx.productAddon.findMany({ where: { addonProductId: productId }, select: { productId: true } })).map((l) => l.productId),
      );
      for (const mainId of mainIds.filter((id) => !existing.has(id))) {
        const last = await tx.productAddon.aggregate({ where: { productId: mainId }, _max: { sortOrder: true } });
        await tx.productAddon.create({ data: { productId: mainId, addonProductId: productId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      }
      // The mains' add-on box must be on, or the customer could never pick it.
      await tx.product.updateMany({ where: { id: { in: mainIds } }, data: { addonsEnabled: true } });
    });
  } catch (error) {
    console.error("[addons] add-on-only save failed", { productId, message: (error as Error).message });
    return fail("บันทึก Add-on ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  console.info("[addons] add-on-only saved", { productId, mains: mainIds.length });
  revalidateAddons(productId);
  for (const id of mainIds) revalidatePath(`/admin/products/${id}`);
  return ok(undefined);
}
