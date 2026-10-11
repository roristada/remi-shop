"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { fail, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema } from "@/lib/validation/product";
import { LicenseFieldType } from "@/lib/generated/prisma/enums";
import { FIELD_LIMITS, fieldOptionsSchema, isChoiceType, scopeWithUsageType } from "@/lib/licenses/form-fields";

/** Kinds a built-in field may use: its answer is copied to a legacy text column. */
const BUILT_IN_TYPES: readonly LicenseFieldType[] = ["TEXT", "TEXTAREA", "EMAIL", "URL"];

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `ไม่เกิน ${max} ตัวอักษร`)
    .transform((v) => (v === "" ? null : v));

const fieldSchema = z
  .object({
    labelTH: z.string().trim().min(1, "กรุณากรอกชื่อช่อง").max(FIELD_LIMITS.label, `ไม่เกิน ${FIELD_LIMITS.label} ตัวอักษร`),
    labelEN: z.string().trim().max(FIELD_LIMITS.label, `ไม่เกิน ${FIELD_LIMITS.label} ตัวอักษร`),
    descriptionTH: optionalText(FIELD_LIMITS.description),
    descriptionEN: optionalText(FIELD_LIMITS.description),
    type: z.enum(LicenseFieldType),
    isRequired: z.boolean(),
    isActive: z.boolean(),
    options: fieldOptionsSchema,
  })
  .superRefine((d, ctx) => {
    if (isChoiceType(d.type) && d.options.length < 1) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "เพิ่มตัวเลือกอย่างน้อย 1 ข้อ" });
    }
    if (new Set(d.options.map((o) => o.id)).size !== d.options.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "ตัวเลือกซ้ำกัน" });
    }
  });

export type FormFieldInput = z.input<typeof fieldSchema>;

function revalidateForm() {
  revalidatePath("/admin/licenses", "layout");
  revalidatePath("/[locale]/product/[slug]/license", "page");
  revalidatePath("/[locale]/account/licenses", "layout");
}

/** New option ids for options the admin just added (ids keep answers' choices stable across label edits). */
function withOptionIds(input: unknown): unknown {
  if (!input || typeof input !== "object" || !("options" in input) || !Array.isArray(input.options)) return input;
  return {
    ...input,
    options: input.options.map((o: unknown) =>
      o && typeof o === "object" && (!("id" in o) || typeof o.id !== "string" || o.id === "")
        ? { ...o, id: randomBytes(6).toString("hex") }
        : o,
    ),
  };
}

/**
 * Creates (id null) or updates a form question. Past requests keep the question as they saw it.
 * Which usage types ask it is set per type (saveUsageTypeFormFields); a new question starts in every type.
 */
export async function saveFormField(fieldId: string | null, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  if (fieldId !== null && !idSchema.safeParse(fieldId).success) return fail("ไม่พบช่องข้อมูลนี้");
  const parsed = fieldSchema.safeParse(withOptionIds(input));
  if (!parsed.success) return invalid(parsed.error);
  const data = {
    ...parsed.data,
    labelEN: parsed.data.labelEN || parsed.data.labelTH,
    // Text fields never keep stale choices.
    options: isChoiceType(parsed.data.type) ? parsed.data.options : [],
  };

  if (fieldId) {
    const existing = await prisma.licenseFormField.findUnique({ where: { id: fieldId }, select: { key: true } });
    if (!existing) return fail("ไม่พบช่องข้อมูลนี้ อาจถูกลบไปแล้ว");
    // Built-in fields feed the legacy columns as text and are asked for every usage type.
    if (existing.key && !BUILT_IN_TYPES.includes(data.type)) {
      return fail("ช่องพื้นฐานใช้ได้เฉพาะแบบข้อความ", { type: "ใช้ข้อความ, ข้อความยาว, อีเมล หรือลิงก์" });
    }
    await prisma.licenseFormField.update({ where: { id: fieldId }, data });
  } else {
    const count = await prisma.licenseFormField.count();
    if (count >= FIELD_LIMITS.fields) return fail(`มีช่องข้อมูลได้ไม่เกิน ${FIELD_LIMITS.fields} ช่อง`);
    const last = await prisma.licenseFormField.aggregate({ _max: { sortOrder: true } });
    await prisma.licenseFormField.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 10 } });
  }
  console.info("[licenses] form field saved", { fieldId: fieldId ?? "new" });
  revalidateForm();
  return ok(undefined, fieldId ? "บันทึกช่องข้อมูลแล้ว" : "เพิ่มช่องข้อมูลแล้ว แสดงในทุกประเภท ปิดบางประเภทได้ที่หน้าประเภทการใช้งาน");
}

/** Built-in fields can only be switched off; others are deleted (past answers keep their own label). */
export async function deleteFormField(fieldId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(fieldId).success) return fail("ไม่พบช่องข้อมูลนี้");
  const field = await prisma.licenseFormField.findUnique({ where: { id: fieldId }, select: { key: true } });
  if (!field) return ok(undefined);
  if (field.key) return fail("ช่องพื้นฐานลบไม่ได้ ใช้ “ปิดใช้งาน” แทน");
  await prisma.licenseFormField.delete({ where: { id: fieldId } });
  console.info("[licenses] form field deleted", { fieldId });
  revalidateForm();
  return ok(undefined, "ลบช่องข้อมูลแล้ว");
}

/** Swaps the field with its neighbour, renumbering all fields so equal sort orders cannot stall a move. */
export async function moveFormField(fieldId: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(fieldId).success || (direction !== "up" && direction !== "down")) return fail("คำขอไม่ถูกต้อง");
  await prisma.$transaction(async (tx) => {
    const all = await tx.licenseFormField.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const from = all.findIndex((f) => f.id === fieldId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= all.length) return;
    [all[from], all[to]] = [all[to], all[from]];
    await Promise.all(all.map((f, i) => tx.licenseFormField.update({ where: { id: f.id }, data: { sortOrder: (i + 1) * 10 } })));
  });
  revalidateForm();
  return ok(undefined);
}

const usageFormSchema = z.object({ enabledFieldIds: z.array(z.uuid()).max(FIELD_LIMITS.fields * 2) });

/**
 * Sets which questions one usage type's form asks, seen from the usage type: every non-built-in
 * field is switched on or off for it (same data as each field's "แสดงในประเภท" setting).
 */
export async function saveUsageTypeFormFields(usageTypeId: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(usageTypeId).success) return fail("ไม่พบประเภทการใช้งานนี้");
  const parsed = usageFormSchema.safeParse(input);
  if (!parsed.success) return fail("ข้อมูลไม่ถูกต้อง");
  const enabled = new Set(parsed.data.enabledFieldIds);

  const changed = await prisma.$transaction(async (tx) => {
    const types = await tx.licenseUsageType.findMany({ orderBy: [{ sortOrder: "asc" }, { nameTH: "asc" }], select: { id: true } });
    const allTypeIds = types.map((t) => t.id);
    if (!allTypeIds.includes(usageTypeId)) return null;
    const fields = await tx.licenseFormField.findMany({
      where: { key: null },
      select: { id: true, appliesToAllTypes: true, usageTypes: { select: { usageTypeId: true } } },
    });

    let count = 0;
    for (const f of fields) {
      const current = f.appliesToAllTypes ? null : f.usageTypes.map((u) => u.usageTypeId);
      const on = enabled.has(f.id);
      if ((current === null || current.includes(usageTypeId)) === on) continue;
      const next = scopeWithUsageType(current, allTypeIds, usageTypeId, on);
      await tx.licenseFormField.update({ where: { id: f.id }, data: { appliesToAllTypes: next === null } });
      await tx.licenseFormFieldUsageType.deleteMany({ where: { fieldId: f.id } });
      if (next && next.length > 0) {
        await tx.licenseFormFieldUsageType.createMany({ data: next.map((id) => ({ fieldId: f.id, usageTypeId: id })) });
      }
      count++;
    }
    return count;
  });
  if (changed === null) return fail("ไม่พบประเภทการใช้งานนี้ อาจถูกลบไปแล้ว");

  console.info("[licenses] usage type form saved", { usageTypeId, changed });
  revalidateForm();
  return ok(undefined, changed > 0 ? "บันทึกฟอร์มของประเภทนี้แล้ว" : "ไม่มีการเปลี่ยนแปลง");
}
