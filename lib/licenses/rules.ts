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
  | "NEEDS_INFO"
  | "AWAITING_PRICE_CONFIRMATION"
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

/** Statuses still in review (not decided): the customer may withdraw these. */
export const OPEN_LICENSE_STATUSES = ["PENDING_REVIEW", "NEEDS_INFO", "AWAITING_PRICE_CONFIRMATION"] as const satisfies LicenseRequestStatus[];

/** Only a request the store has not decided yet can be withdrawn by the customer. */
export function canCancelLicenseRequest(status: LicenseRequestStatus): boolean {
  return (OPEN_LICENSE_STATUSES as readonly LicenseRequestStatus[]).includes(status);
}

/** How long after submitting a customer may edit the request's details or attach the artwork. */
export const LICENSE_EDIT_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const LICENSE_EDIT_WINDOW_MS = LICENSE_EDIT_WINDOW_DAYS * DAY_MS;

/** End of the edit window (exclusive). */
export function licenseEditDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + LICENSE_EDIT_WINDOW_MS);
}

/**
 * Details and artwork stay editable for 30 days while the request is live (waiting or approved),
 * and always while the store is waiting for the customer's corrections (NEEDS_INFO).
 * The chosen usage types are locked at submit; only the store can change the price.
 */
export function canEditLicenseRequest(status: LicenseRequestStatus, createdAt: Date, now: Date = new Date()): boolean {
  if (status === "NEEDS_INFO") return true;
  return (status === "PENDING_REVIEW" || status === "APPROVED") && now < licenseEditDeadline(createdAt);
}

export const LICENSE_MESSAGE_MAX = 1000;

export type ChangeRequestInput = {
  /** Current total, satang. */
  currentTotal: number;
  /** Proposed total, satang; null = keep the price. */
  newTotal: number | null;
  message: string | null;
  fieldIds: string[];
};

export type ChangeRequestPlan =
  | { ok: true; status: "NEEDS_INFO" | "AWAITING_PRICE_CONFIRMATION"; priceChanged: boolean }
  | { ok: false; code: "NOTHING" | "BAD_PRICE" };

/**
 * What an admin "send back to the customer" does. Asking for details (a message or flagged fields)
 * means NEEDS_INFO, even with a new price; a new price alone waits for the customer's acceptance.
 * Either way the request comes back to the store for a final review.
 */
export function planChangeRequest(input: ChangeRequestInput): ChangeRequestPlan {
  const { currentTotal, newTotal, message, fieldIds } = input;
  if (newTotal !== null && (!Number.isSafeInteger(newTotal) || newTotal <= 0)) return { ok: false, code: "BAD_PRICE" };
  const priceChanged = newTotal !== null && newTotal !== currentTotal;
  const asksForInfo = Boolean(message) || fieldIds.length > 0;
  if (!priceChanged && !asksForInfo) return { ok: false, code: "NOTHING" };
  return { ok: true, status: asksForInfo ? "NEEDS_INFO" : "AWAITING_PRICE_CONFIRMATION", priceChanged };
}

export const LICENSE_PAYMENT_DAYS_MIN = 1;
export const LICENSE_PAYMENT_DAYS_MAX = 30;

/** Payment deadline for the order created when a request is approved. */
export function licensePaymentDeadline(approvedAt: Date, days: number): Date {
  return new Date(approvedAt.getTime() + days * 24 * 60 * 60 * 1000);
}
