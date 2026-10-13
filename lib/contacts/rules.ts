import { z } from "zod";
import type { ContactChannelType } from "@/lib/generated/prisma/enums";

export const CONTACT_CHANNEL_TYPES = [
  "LINE",
  "FACEBOOK",
  "INSTAGRAM",
  "X",
  "TIKTOK",
  "YOUTUBE",
  "DISCORD",
  "EMAIL",
  "PHONE",
  "WEBSITE",
] as const satisfies readonly ContactChannelType[];

export const CONTACT_CHANNELS_MAX = 20;
export const CONTACT_LABEL_MAX = 60;
export const CONTACT_VALUE_MAX = 300;

/** Admin-facing names and input hints per type. */
export const CONTACT_TYPE_ADMIN: Record<ContactChannelType, { name: string; placeholder: string }> = {
  LINE: { name: "LINE", placeholder: "https://lin.ee/xxxx หรือ https://line.me/ti/p/~id" },
  FACEBOOK: { name: "Facebook", placeholder: "https://facebook.com/yourpage" },
  INSTAGRAM: { name: "Instagram", placeholder: "https://instagram.com/yourname" },
  X: { name: "X (Twitter)", placeholder: "https://x.com/yourname" },
  TIKTOK: { name: "TikTok", placeholder: "https://tiktok.com/@yourname" },
  YOUTUBE: { name: "YouTube", placeholder: "https://youtube.com/@yourchannel" },
  DISCORD: { name: "Discord", placeholder: "https://discord.gg/xxxx" },
  EMAIL: { name: "อีเมล", placeholder: "hello@example.com" },
  PHONE: { name: "โทรศัพท์", placeholder: "0812345678" },
  WEBSITE: { name: "เว็บไซต์ / อื่น ๆ", placeholder: "https://..." },
};

const EMAIL = z.email();
const PHONE = /^\+?[0-9][0-9 -]{5,19}$/;

/** Only http(s) links, so a stored value can never become a `javascript:` or other scheme link. */
function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Why `value` is not valid for `type`, or null when it is. */
export function contactValueError(type: ContactChannelType, value: string): string | null {
  if (type === "EMAIL") return EMAIL.safeParse(value).success ? null : "อีเมลไม่ถูกต้อง";
  if (type === "PHONE") return PHONE.test(value) ? null : "เบอร์โทรไม่ถูกต้อง";
  return isWebUrl(value) ? null : "ต้องเป็นลิงก์ที่ขึ้นต้นด้วย https://";
}

/** Link target for a saved channel (values are validated on save, so this only formats). */
export function contactHref(type: ContactChannelType, value: string): string {
  if (type === "EMAIL") return `mailto:${value}`;
  if (type === "PHONE") return `tel:${value.replace(/[ -]/g, "")}`;
  return value;
}

const channelSchema = z
  .object({
    type: z.enum(CONTACT_CHANNEL_TYPES, { error: "เลือกประเภท" }),
    label: z
      .string()
      .trim()
      .min(1, "กรอกชื่อที่แสดง")
      .max(CONTACT_LABEL_MAX, `ไม่เกิน ${CONTACT_LABEL_MAX} ตัวอักษร`),
    value: z.string().trim().min(1, "กรอกลิงก์หรือข้อมูลติดต่อ").max(CONTACT_VALUE_MAX, `ไม่เกิน ${CONTACT_VALUE_MAX} ตัวอักษร`),
  })
  .superRefine((c, ctx) => {
    const error = contactValueError(c.type, c.value);
    if (error) ctx.addIssue({ code: "custom", path: ["value"], message: error });
  });

/** The whole list as saved by the admin; order in the array is the display order. */
export const contactChannelsSchema = z
  .array(channelSchema)
  .max(CONTACT_CHANNELS_MAX, `เพิ่มได้ไม่เกิน ${CONTACT_CHANNELS_MAX} ช่องทาง`);

export type ContactChannelInput = z.input<typeof channelSchema>;
