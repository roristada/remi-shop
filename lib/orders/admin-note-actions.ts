"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isForeignKeyViolation } from "@/lib/prisma/errors";
import { fail, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema } from "@/lib/validation/product";

const ORDER_NOTE_MAX = 2000;

const noteSchema = z.string().trim().max(ORDER_NOTE_MAX, `ไม่เกิน ${ORDER_NOTE_MAX} ตัวอักษร`);

/** Saves the owner's internal note on an order; an empty note removes it. Customers never see it. */
export async function saveOrderAdminNote(orderId: string, body: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(orderId).success) return fail("ไม่พบคำสั่งซื้อ");
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "ข้อความไม่ถูกต้อง");

  try {
    if (parsed.data === "") {
      await prisma.orderAdminNote.deleteMany({ where: { orderId } });
    } else {
      await prisma.orderAdminNote.upsert({
        where: { orderId },
        create: { orderId, body: parsed.data },
        update: { body: parsed.data },
      });
    }
  } catch (error) {
    if (isForeignKeyViolation(error)) return fail("ไม่พบคำสั่งซื้อ");
    console.error("[orders] admin note save failed", { orderId, message: (error as Error).message });
    return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin/payments");
  return ok(undefined, "บันทึกหมายเหตุแล้ว");
}
