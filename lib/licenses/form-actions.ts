"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { fail, invalid, ok, type ActionResult } from "@/lib/actions/result";
import { idSchema } from "@/lib/validation/product";
import { LicenseFieldType } from "@/lib/generated/prisma/enums";
import { FIELD_LIMITS, fieldOptionsSchema, isChoiceType } from "@/lib/licenses/form-fields";

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

function parseField(input: unknown) {
  const parsed = fieldSchema.safeParse(withOptionIds(input));
  if (!parsed.success) return parsed;
  return {
    success: true as const,
    data: {
      ...parsed.data,
      labelEN: parsed.data.labelEN || parsed.data.labelTH,
      // Text fields never keep stale choices.
      options: isChoiceType(parsed.data.type) ? parsed.data.options : [],
    },
  };
}

/** Adds a question to the end of one usage type's form. */
export async function createFormField(usageTypeId: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(usageTypeId).success) return fail("ไม่พบประเภทการใช้งานนี้");
  const parsed = parseField(input);
  if (!parsed.success) return invalid(parsed.error);

  const [type, count, last] = await Promise.all([
    prisma.licenseUsageType.findUnique({ where: { id: usageTypeId }, select: { id: true } }),
    prisma.licenseFormField.count({ where: { usageTypeId } }),
    prisma.licenseFormField.aggregate({ where: { usageTypeId }, _max: { sortOrder: true } }),
  ]);
  if (!type) return fail("ไม่พบประเภทการใช้งานนี้ อาจถูกลบไปแล้ว");
  if (count >= FIELD_LIMITS.fields) return fail(`ฟอร์มหนึ่งมีช่องข้อมูลได้ไม่เกิน ${FIELD_LIMITS.fields} ช่อง`);
  await prisma.licenseFormField.create({ data: { ...parsed.data, usageTypeId, sortOrder: (last._max.sortOrder ?? 0) + 10 } });
  console.info("[licenses] form field added", { usageTypeId });
  revalidateForm();
  return ok(undefined, "เพิ่มช่องข้อมูลแล้ว");
}

/** Updates one question of one form; other usage types' forms are not touched. Past requests keep the question as they saw it. */
export async function updateFormField(fieldId: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(fieldId).success) return fail("ไม่พบช่องข้อมูลนี้");
  const parsed = parseField(input);
  if (!parsed.success) return invalid(parsed.error);

  const existing = await prisma.licenseFormField.findUnique({ where: { id: fieldId }, select: { key: true } });
  if (!existing) return fail("ไม่พบช่องข้อมูลนี้ อาจถูกลบไปแล้ว");
  // Built-in fields feed the legacy columns as text.
  if (existing.key && !BUILT_IN_TYPES.includes(parsed.data.type)) {
    return fail("ช่องพื้นฐานใช้ได้เฉพาะแบบข้อความ", { type: "ใช้ข้อความ, ข้อความยาว, อีเมล หรือลิงก์" });
  }
  await prisma.licenseFormField.update({ where: { id: fieldId }, data: parsed.data });
  console.info("[licenses] form field saved", { fieldId });
  revalidateForm();
  return ok(undefined, "บันทึกช่องข้อมูลแล้ว");
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

/**
 * Swaps the field with its neighbour in the same form, renumbering that form so equal sort
 * orders cannot stall a move.
 */
export async function moveFormField(fieldId: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(fieldId).success || (direction !== "up" && direction !== "down")) return fail("คำขอไม่ถูกต้อง");
  await prisma.$transaction(async (tx) => {
    const field = await tx.licenseFormField.findUnique({ where: { id: fieldId }, select: { usageTypeId: true } });
    if (!field) return;
    const all = await tx.licenseFormField.findMany({
      where: { usageTypeId: field.usageTypeId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const from = all.findIndex((f) => f.id === fieldId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from === -1 || to < 0 || to >= all.length) return;
    [all[from], all[to]] = [all[to], all[from]];
    await Promise.all(all.map((f, i) => tx.licenseFormField.update({ where: { id: f.id }, data: { sortOrder: (i + 1) * 10 } })));
  });
  revalidateForm();
  return ok(undefined);
}
