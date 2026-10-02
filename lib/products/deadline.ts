import type { ProductStatus } from "@/lib/products/status";

export type Deadline = { kind: "opens" | "saleEnds" | "discountEnds"; at: Date };

/**
 * The single deadline a product page shows. Before the sale opens only the opening counts (a
 * scheduled discount waits); once on sale, whichever of the discount end and sale end comes first.
 */
export function pickDeadline(input: {
  status: ProductStatus;
  saleStartAt: Date | null;
  saleEndAt: Date | null;
  /** Only when a discount applies right now. */
  discountEndsAt: Date | null;
}): Deadline | null {
  if (input.status === "SCHEDULED") return input.saleStartAt ? { kind: "opens", at: input.saleStartAt } : null;
  if (input.status !== "ACTIVE") return null;
  const { discountEndsAt: discount, saleEndAt: sale } = input;
  if (discount && (!sale || discount <= sale)) return { kind: "discountEnds", at: discount };
  return sale ? { kind: "saleEnds", at: sale } : null;
}
