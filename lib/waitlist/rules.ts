import type { ProductStatus } from "@/lib/products/status";

// Pure waitlist rules (no DB).

/** Only a product waiting for its sale start can be joined; leaving is always allowed. */
export function canJoinWaitlist(status: ProductStatus): boolean {
  return status === "SCHEDULED";
}

/** An entry counts as "waiting" until its "now on sale" notification has been created. */
export function isWaiting(entry: { notifiedAt: Date | null } | null): boolean {
  return entry !== null && entry.notifiedAt === null;
}
