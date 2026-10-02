import type { PublishStatus } from "@/lib/generated/prisma/enums";
import type { PriceInput } from "@/lib/pricing/calculate";

/** Customer-facing status, always derived server-side (never stored or trusted from the client). */
export type ProductStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "DISABLED" | "ENDED";

export type ProductStatusInput = {
  publishStatus: PublishStatus;
  saleStartAt: Date | null;
  saleEndAt: Date | null;
};

/** Sale window is [saleStartAt, saleEndAt); a null bound is open-ended. */
export function getProductStatus(product: ProductStatusInput, now: Date = new Date()): ProductStatus {
  if (product.publishStatus === "DRAFT") return "DRAFT";
  if (product.publishStatus === "DISABLED") return "DISABLED";
  if (product.saleStartAt && now < product.saleStartAt) return "SCHEDULED";
  if (product.saleEndAt && now >= product.saleEndAt) return "ENDED";
  return "ACTIVE";
}

export function isPurchasable(product: ProductStatusInput, now: Date = new Date()): boolean {
  return getProductStatus(product, now) === "ACTIVE";
}

/** Where `now` falls in a configured time window (NONE = no window set). */
export type WindowState = "NONE" | "UPCOMING" | "ACTIVE" | "ENDED";

/** Same bounds as getProductStatus: [saleStartAt, saleEndAt). */
export function getSaleWindowState(
  product: Pick<ProductStatusInput, "saleStartAt" | "saleEndAt">,
  now: Date = new Date(),
): WindowState {
  if (!product.saleStartAt && !product.saleEndAt) return "NONE";
  if (product.saleStartAt && now < product.saleStartAt) return "UPCOMING";
  if (product.saleEndAt && now >= product.saleEndAt) return "ENDED";
  return "ACTIVE";
}

/** Same rule as isDiscountActive: a percent plus both bounds, inclusive [start, end]. */
export function getDiscountWindowState(input: Omit<PriceInput, "price">, now: Date = new Date()): WindowState {
  const { discountPercent, discountStartAt, discountEndAt } = input;
  if (discountPercent === null || !discountStartAt || !discountEndAt) return "NONE";
  if (now < discountStartAt) return "UPCOMING";
  if (now > discountEndAt) return "ENDED";
  return "ACTIVE";
}

/**
 * Non-blocking admin warnings for windows that are already over when saved — the product
 * saves fine, but the discount or sale would never take effect.
 */
export function scheduleWarnings(
  input: Omit<PriceInput, "price"> & Pick<ProductStatusInput, "saleStartAt" | "saleEndAt">,
  now: Date = new Date(),
): Partial<Record<"discountEndAt" | "saleEndAt", string>> {
  const out: Partial<Record<"discountEndAt" | "saleEndAt", string>> = {};
  if (getDiscountWindowState(input, now) === "ENDED") out.discountEndAt = "ช่วงส่วนลดสิ้นสุดไปแล้ว ส่วนลดจะไม่ถูกใช้";
  if (getSaleWindowState(input, now) === "ENDED") out.saleEndAt = "ช่วงขายสิ้นสุดไปแล้ว ลูกค้าจะสั่งซื้อไม่ได้";
  return out;
}

export const PRODUCT_STATUS_LABEL_TH: Record<ProductStatus, string> = {
  DRAFT: "ฉบับร่าง",
  SCHEDULED: "รอเปิดขาย",
  ACTIVE: "กำลังขาย",
  DISABLED: "ซ่อนอยู่",
  ENDED: "สิ้นสุดการขาย",
};
