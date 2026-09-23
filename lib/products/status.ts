import type { PublishStatus } from "@/lib/generated/prisma/enums";

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

export const PRODUCT_STATUS_LABEL_TH: Record<ProductStatus, string> = {
  DRAFT: "ฉบับร่าง",
  SCHEDULED: "รอเปิดขาย",
  ACTIVE: "กำลังขาย",
  DISABLED: "ปิดการขาย",
  ENDED: "สิ้นสุดการขาย",
};
