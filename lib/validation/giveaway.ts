import { z } from "zod";
import { optionalDateTime, slugSchema } from "@/lib/validation/product";

// Admin is Thai-only, so messages are Thai strings (not translation keys).

export const GIVEAWAY_TITLE_MAX = 120;
export const GIVEAWAY_DESCRIPTION_MAX = 3000;
export const GIVEAWAY_PRIZES_MAX = 20;
export const GIVEAWAY_WINNERS_MAX = 1000;

const title = z.string().trim().min(1, "กรุณากรอกชื่อกิจกรรม").max(GIVEAWAY_TITLE_MAX, `ไม่เกิน ${GIVEAWAY_TITLE_MAX} ตัวอักษร`);
const description = z.string().trim().max(GIVEAWAY_DESCRIPTION_MAX, `ไม่เกิน ${GIVEAWAY_DESCRIPTION_MAX} ตัวอักษร`);
const requiredDateTime = optionalDateTime
  .refine((v) => v !== null, "กรุณาเลือกวันเวลา")
  .transform((v) => v as Date);

export const giveawayPrizeSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().nullable(),
  winnerCount: z.number().int().min(1, "อย่างน้อย 1 คน").max(GIVEAWAY_WINNERS_MAX, `ไม่เกิน ${GIVEAWAY_WINNERS_MAX} คน`),
});

export type GiveawayPrizeInput = z.infer<typeof giveawayPrizeSchema>;

/** Prize lines from the form's JSON field: 1–20 lines, each product/variant once. */
export const giveawayPrizesSchema = z
  .array(giveawayPrizeSchema)
  .min(1, "เพิ่มรางวัลอย่างน้อย 1 รายการ")
  .max(GIVEAWAY_PRIZES_MAX, `ไม่เกิน ${GIVEAWAY_PRIZES_MAX} รายการ`)
  .refine(
    (prizes) => new Set(prizes.map((p) => `${p.productId}:${p.variantId ?? ""}`)).size === prizes.length,
    "มีรางวัลซ้ำกัน",
  );

export const giveawaySchema = z
  .object({
    slug: slugSchema,
    titleTH: title,
    titleEN: title,
    descriptionTH: description,
    descriptionEN: description,
    startsAt: requiredDateTime,
    endsAt: requiredDateTime,
    isPublished: z.boolean(),
  })
  .refine((v) => v.endsAt > v.startsAt, { message: "เวลาปิดต้องหลังเวลาเปิด", path: ["endsAt"] });

export type GiveawayInput = z.infer<typeof giveawaySchema>;

/** Parses the JSON prize list; malformed JSON counts as an invalid list. */
export function parsePrizesJson(raw: string) {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = null;
  }
  return giveawayPrizesSchema.safeParse(value);
}
