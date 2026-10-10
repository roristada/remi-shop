"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { fail, formString, invalid, ok, okNotice, type ActionResult } from "@/lib/actions/result";
import { idSchema } from "@/lib/validation/product";
import { parseSheetId } from "@/lib/costs/sheet";
import { syncCostSheet, type CostSyncReport } from "@/lib/costs/service";

const settingsSchema = z.object({
  sheet: z
    .string()
    .trim()
    .refine((v) => parseSheetId(v) !== null, "วางลิงก์ Google Sheet หรือรหัสชีต"),
  rate: z
    .string()
    .trim()
    .regex(/^\d{1,4}(\.\d{1,4})?$/, "เรทไม่ถูกต้อง (ทศนิยมไม่เกิน 4 ตำแหน่ง)")
    .refine((v) => Number(v) > 0, "เรทต้องมากกว่า 0"),
});

/** Sheet and exchange rate. A new rate applies to costs taken from now on; recorded costs keep theirs. */
export async function updateCostSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse({ sheet: formString(formData, "sheet"), rate: formString(formData, "rate") });
  if (!parsed.success) return invalid(parsed.error);
  const data = { costSheetId: parseSheetId(parsed.data.sheet), costRate: parsed.data.rate };
  await prisma.storeSetting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  revalidatePath("/admin/profit");
  return ok(undefined, "บันทึกการตั้งค่าต้นทุนแล้ว");
}

/** The "ดึงข้อมูลจาก Sheet" button. */
export async function syncCosts(): Promise<ActionResult<CostSyncReport>> {
  await requireAdmin();
  const result = await syncCostSheet();
  if (!result.ok) return fail(result.error);
  revalidatePath("/admin/profit");
  revalidatePath("/admin/orders");
  const r = result.report;
  return okNotice(
    r,
    `ดึงข้อมูลแล้ว ${r.rows.toLocaleString("th-TH")} แถวจาก ${r.tabsRead} แท็บ · เติมต้นทุนให้ออเดอร์ ${r.filledLines.toLocaleString("th-TH")} รายการ`,
  );
}

/** Marks (or unmarks) that the store emailed the files of an order's lines that have no download. */
export async function setFilesEmailed(orderId: string, sent: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!idSchema.safeParse(orderId).success || typeof sent !== "boolean") return fail("คำขอไม่ถูกต้อง");
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, kind: "PRODUCT", status: "COMPLETED" },
    data: { filesEmailedAt: sent ? new Date() : null },
  });
  if (count === 0) return fail("ทำเครื่องหมายได้เฉพาะคำสั่งซื้อที่ชำระแล้ว");
  console.info("[orders] files emailed marker", { orderId, sent, adminId: admin.id });
  revalidatePath("/admin/orders");
  return ok(undefined, sent ? "บันทึกว่าส่งไฟล์ทางอีเมลแล้ว" : "ยกเลิกเครื่องหมายแล้ว");
}
