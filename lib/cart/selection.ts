import type { PurchaseOption } from "@/lib/cart/queries";

/** Options the buyer can't add right now, so the picker doesn't start on them. */
const BLOCKED_STATES: PurchaseOption["state"][] = ["owned", "inOrder", "soldOut"];

/** The variant the product page starts with: the first one that can still be bought. */
export function defaultVariantId(options: PurchaseOption[]): string | null {
  if (options.length === 0) return null;
  return (options.find((o) => !BLOCKED_STATES.includes(o.state)) ?? options[0]).variantId;
}
