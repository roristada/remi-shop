import { z } from "zod";
import { parseBangkokDateTimeLocal } from "@/lib/datetime";

// Admin is Thai-only, so messages are Thai strings (not translation keys).

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const requiredText = (max: number) =>
  z.string().trim().min(1, "กรุณากรอกข้อมูล").max(max, `ไม่เกิน ${max} ตัวอักษร`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `ไม่เกิน ${max} ตัวอักษร`)
    .transform((v) => (v === "" ? null : v));

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "กรุณากรอก slug")
  .max(100, "ไม่เกิน 100 ตัวอักษร")
  .regex(SLUG_PATTERN, "ใช้ได้เฉพาะ a-z, 0-9 และ - (เช่น watercolor-brush-pack)");

/** Money as a decimal string with at most 2 places. */
const money = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "ราคาไม่ถูกต้อง (ทศนิยมไม่เกิน 2 ตำแหน่ง)");

const optionalPercent = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^\d{1,3}(\.\d{1,2})?$/.test(v), "ส่วนลดต้องเป็นตัวเลข (ทศนิยมไม่เกิน 2 ตำแหน่ง)")
  .refine((v) => v === null || (Number(v) > 0 && Number(v) < 100), "ส่วนลดต้องมากกว่า 0 และน้อยกว่า 100");

/** `datetime-local` value interpreted as Asia/Bangkok. */
const optionalDateTime = z.string().transform((v, ctx) => {
  const parsed = parseBangkokDateTimeLocal(v);
  if (parsed === undefined) {
    ctx.addIssue({ code: "custom", message: "วันเวลาไม่ถูกต้อง" });
    return z.NEVER;
  }
  return parsed;
});

const downloadLimit = z
  .object({ mode: z.enum(["unlimited", "5", "10", "custom"]), custom: z.string().trim() })
  .transform((v, ctx) => {
    if (v.mode === "unlimited") return null;
    if (v.mode !== "custom") return Number(v.mode);
    const n = Number(v.custom);
    if (!Number.isInteger(n) || n < 1 || n > 10000) {
      ctx.addIssue({ code: "custom", message: "จำนวนครั้งต้องเป็นจำนวนเต็ม 1–10000", path: ["custom"] });
      return z.NEVER;
    }
    return n;
  });

export const productSchema = z
  .object({
    slug: slugSchema,
    nameTH: requiredText(150),
    nameEN: requiredText(150),
    descriptionTH: z.string().trim().max(20000, "ยาวเกินไป"),
    descriptionEN: z.string().trim().max(20000, "ยาวเกินไป"),
    categoryId: z.uuid("กรุณาเลือกหมวดหมู่"),

    price: money,
    discountPercent: optionalPercent,
    discountStartAt: optionalDateTime,
    discountEndAt: optionalDateTime,
    saleStartAt: optionalDateTime,
    saleEndAt: optionalDateTime,

    software: optionalText(100),
    supportedVersion: optionalText(100),
    fileFormat: optionalText(100),
    license: optionalText(200),
    requirementsTH: optionalText(2000),
    requirementsEN: optionalText(2000),

    downloadLimit,

    seoTitleTH: optionalText(70),
    seoTitleEN: optionalText(70),
    metaDescriptionTH: optionalText(160),
    metaDescriptionEN: optionalText(160),
  })
  .superRefine((d, ctx) => {
    if (d.saleStartAt && d.saleEndAt && d.saleEndAt <= d.saleStartAt) {
      ctx.addIssue({ code: "custom", path: ["saleEndAt"], message: "วันสิ้นสุดต้องอยู่หลังวันเริ่มขาย" });
    }
    // Discount is active only within [start, end], so both bounds are required with a percent.
    if (d.discountPercent !== null) {
      if (!d.discountStartAt) {
        ctx.addIssue({ code: "custom", path: ["discountStartAt"], message: "กรุณาระบุวันเริ่มส่วนลด" });
      }
      if (!d.discountEndAt) {
        ctx.addIssue({ code: "custom", path: ["discountEndAt"], message: "กรุณาระบุวันสิ้นสุดส่วนลด" });
      }
    }
    if (d.discountStartAt && d.discountEndAt && d.discountEndAt <= d.discountStartAt) {
      ctx.addIssue({ code: "custom", path: ["discountEndAt"], message: "วันสิ้นสุดต้องอยู่หลังวันเริ่มส่วนลด" });
    }
  });

export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  slug: slugSchema,
  nameTH: requiredText(80),
  nameEN: requiredText(80),
  descriptionTH: optionalText(500),
  descriptionEN: optionalText(500),
  status: z.enum(["ACTIVE", "HIDDEN"]),
  sortOrder: z.coerce.number().int("ต้องเป็นจำนวนเต็ม").min(0).max(9999),
});

export const versionSchema = z.object({
  versionNumber: z
    .string()
    .trim()
    .min(1, "กรุณากรอกเลขเวอร์ชัน")
    .max(30, "ไม่เกิน 30 ตัวอักษร")
    .regex(/^[0-9A-Za-z][0-9A-Za-z._-]*$/, "ใช้ได้เฉพาะตัวอักษร ตัวเลข . _ - (เช่น 1.0, 2.1-beta)"),
  releaseDate: optionalDateTime,
  releaseNotesTH: optionalText(5000),
  releaseNotesEN: optionalText(5000),
  setLatest: z.boolean(),
});

export const imageAltSchema = z.object({
  altTextTH: optionalText(200),
  altTextEN: optionalText(200),
});

export const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
});

export const idSchema = z.uuid();

export const folderSchema = z.object({
  slug: slugSchema,
  nameTH: requiredText(80),
  nameEN: requiredText(80),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
});

/** Upper bound for one drag-reorder request (folders or products in a folder). */
export const MAX_REORDER_ITEMS = 1000;
