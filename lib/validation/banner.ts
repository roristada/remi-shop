import { z } from "zod";
import { BannerTheme } from "@/lib/generated/prisma/enums";
import { optionalDateTime } from "@/lib/validation/product";

export const BANNER_TITLE_MAX = 80;
export const BANNER_TAG_MAX = 40;
export const BANNER_CTA_MAX = 24;
export const ANNOUNCEMENT_BAR_MAX = 200;
const LINK_MAX = 500;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `ไม่เกิน ${max} ตัวอักษร`)
    .transform((v) => (v === "" ? null : v));

/**
 * A banner/notice link: a path on this site ("/shop", "/th/product/x") or an http(s) URL.
 * Protocol-relative ("//evil.com") and other schemes (javascript:, data:) are refused.
 */
export const optionalLink = z
  .string()
  .trim()
  .max(LINK_MAX, `ไม่เกิน ${LINK_MAX} ตัวอักษร`)
  .refine((v) => v === "" || isSafeLink(v), "ใส่ลิงก์ที่ขึ้นต้นด้วย / (หน้าในเว็บ) หรือ https://")
  .transform((v) => (v === "" ? null : v));

export function isSafeLink(v: string): boolean {
  if (/^\/(?![/\\])/.test(v)) return true;
  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Internal links go through the locale-aware router; a stored "/th/…" or "/en/…" prefix is dropped. */
export function isInternalLink(v: string): boolean {
  return v.startsWith("/");
}

export function stripLocalePrefix(path: string): string {
  return path.replace(/^\/(th|en)(?=\/|$)/, "") || "/";
}

const focus = z.coerce.number().int().min(0).max(100);

export const bannerSchema = z
  .object({
    titleTH: z.string().trim().min(1, "กรุณากรอกหัวข้อ").max(BANNER_TITLE_MAX, `ไม่เกิน ${BANNER_TITLE_MAX} ตัวอักษร`),
    titleEN: z.string().trim().min(1, "กรุณากรอกหัวข้อ").max(BANNER_TITLE_MAX, `ไม่เกิน ${BANNER_TITLE_MAX} ตัวอักษร`),
    descriptionTH: optionalText(BANNER_TAG_MAX),
    descriptionEN: optionalText(BANNER_TAG_MAX),
    ctaTH: optionalText(BANNER_CTA_MAX),
    ctaEN: optionalText(BANNER_CTA_MAX),
    link: optionalLink,
    theme: z.enum(BannerTheme),
    imageFocusX: focus,
    imageFocusY: focus,
    startAt: optionalDateTime,
    endAt: optionalDateTime,
    isActive: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (d.startAt && d.endAt && d.endAt <= d.startAt) {
      ctx.addIssue({ code: "custom", path: ["endAt"], message: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม" });
    }
    // A button needs somewhere to go.
    if ((d.ctaTH || d.ctaEN) && !d.link) {
      ctx.addIssue({ code: "custom", path: ["link"], message: "ใส่ลิงก์ให้ปุ่มด้วย" });
    }
  });

export type BannerInput = z.infer<typeof bannerSchema>;

export const announcementBarSchema = z
  .object({
    enabled: z.boolean(),
    textTH: optionalText(ANNOUNCEMENT_BAR_MAX),
    textEN: optionalText(ANNOUNCEMENT_BAR_MAX),
    link: optionalLink,
  })
  .superRefine((d, ctx) => {
    if (d.enabled && !d.textTH) ctx.addIssue({ code: "custom", path: ["textTH"], message: "กรอกข้อความก่อนเปิดแสดง" });
  });
