import type { LicenseRequestStatus, OrderStatus } from "@/lib/generated/prisma/enums";
import { toHundredths } from "@/lib/pricing/calculate";

// Pure commercial-license rules (no DB). A license is rights only: its order has no items,
// and the product discount never applies to license prices.

/** Anti-spam: requests a customer may have waiting for review at once. */
export const MAX_OPEN_LICENSE_REQUESTS = 5;

type DecimalLike = { toString(): string } | string | number;

/** A usage type the product currently offers, at its current price. */
export type LicenseOffer = { usageTypeId: string; nameTH: string; nameEN: string; price: DecimalLike };

export type LicenseLine = { usageTypeId: string; nameTH: string; nameEN: string; price: number };

export type PickResult = { ok: true; lines: LicenseLine[]; total: number } | { ok: false; code: "EMPTY" | "OPTION_CHANGED" };

/**
 * Resolves the customer's chosen usage types against what the product offers right now.
 * Amounts are in satang. A choice that is no longer offered fails the whole request, so the
 * customer never pays for a set of rights different from the one they picked.
 */
export function pickLicenseLines(offers: LicenseOffer[], selectedIds: readonly string[]): PickResult {
  const unique = [...new Set(selectedIds)];
  if (unique.length === 0) return { ok: false, code: "EMPTY" };
  const byId = new Map(offers.map((o) => [o.usageTypeId, o]));
  const lines: LicenseLine[] = [];
  for (const id of unique) {
    const offer = byId.get(id);
    if (!offer) return { ok: false, code: "OPTION_CHANGED" };
    lines.push({ usageTypeId: id, nameTH: offer.nameTH, nameEN: offer.nameEN, price: toHundredths(offer.price) });
  }
  // Keep the product's offer order, not the order the boxes were ticked in.
  const rank = new Map(offers.map((o, i) => [o.usageTypeId, i]));
  lines.sort((a, b) => rank.get(a.usageTypeId)! - rank.get(b.usageTypeId)!);
  return { ok: true, lines, total: lines.reduce((sum, l) => sum + l.price, 0) };
}

/** What the customer sees for a request, combining the review state with its order's payment state. */
export type LicenseStage =
  | "REVIEW"
  | "REJECTED"
  | "CANCELLED"
  | "AWAITING_PAYMENT"
  | "PAYMENT_REVIEW"
  | "PAYMENT_REJECTED"
  | "ACTIVE"
  | "PAYMENT_CANCELLED";

export function licenseStage(status: LicenseRequestStatus, orderStatus: OrderStatus | null): LicenseStage {
  if (status !== "APPROVED") return status === "PENDING_REVIEW" ? "REVIEW" : status;
  switch (orderStatus) {
    case "WAITING_REVIEW":
      return "PAYMENT_REVIEW";
    case "PAYMENT_REJECTED":
      return "PAYMENT_REJECTED";
    case "COMPLETED":
      return "ACTIVE";
    case "CANCELLED":
      return "PAYMENT_CANCELLED";
    default:
      return "AWAITING_PAYMENT";
  }
}

/** Only a request the store has not decided yet can be withdrawn by the customer. */
export function canCancelLicenseRequest(status: LicenseRequestStatus): boolean {
  return status === "PENDING_REVIEW";
}

export const LICENSE_PAYMENT_DAYS_MIN = 1;
export const LICENSE_PAYMENT_DAYS_MAX = 30;

/** Payment deadline for the order created when a request is approved. */
export function licensePaymentDeadline(approvedAt: Date, days: number): Date {
  return new Date(approvedAt.getTime() + days * 24 * 60 * 60 * 1000);
}
