"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema } from "@/lib/validation/product";
import { cleanAddonIds } from "@/lib/addons/rules";

/**
 * Replaces a product's add-on list (in the given order) and its on/off switch. Only products
 * without variants can be add-ons: the add-on box has no option picker.
 */
export async function saveProductAddons(productId: string, input: { enabled: boolean; addonIds: string[] }): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(productId).success || typeof input?.enabled !== "boolean") return fail("คำขอไม่ถูกต้อง");
  const addonIds = cleanAddonIds(productId, input.addonIds);
  if (!addonIds) return fail("รายการ Add-on ไม่ถูกต้อง (สูงสุด 12 รายการ)");

  const found = await prisma.product.findMany({
    where: { id: { in: addonIds }, variants: { none: {} } },
    select: { id: true },
  });
  if (found.length !== addonIds.length) return fail("สินค้าบางรายการถูกลบหรือมีตัวเลือกแล้ว ใช้เป็น Add-on ไม่ได้ กรุณารีเฟรชหน้า");

  try {
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { addonsEnabled: input.enabled } }),
      prisma.productAddon.deleteMany({ where: { productId } }),
      prisma.productAddon.createMany({ data: addonIds.map((addonProductId, i) => ({ productId, addonProductId, sortOrder: i })) }),
    ]);
  } catch (error) {
    console.error("[addons] save failed", { productId, message: (error as Error).message });
    return fail("บันทึก Add-on ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  console.info("[addons] saved", { productId, enabled: input.enabled, count: addonIds.length });
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/[locale]/product/[slug]", "page");
  return ok(undefined);
}
