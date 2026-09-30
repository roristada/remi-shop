import type { NotificationType } from "@/lib/generated/prisma/enums";

// Pure notification rules (no DB): what a row's params may hold and where it links.

/** Snapshot values a message may use. Every field is plain text, never rendered as HTML. */
export type NotificationParams = {
  productNameTH?: string;
  productNameEN?: string;
  versionNumber?: string;
  orderNumber?: string;
  reason?: string;
};

const PARAM_KEYS = ["productNameTH", "productNameEN", "versionNumber", "orderNumber", "reason"] as const;

/** Reads a stored params value defensively: unknown keys and non-strings are dropped. */
export function parseNotificationParams(value: unknown): NotificationParams {
  const out: NotificationParams = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const record = value as Record<string, unknown>;
  for (const key of PARAM_KEYS) {
    const v = record[key];
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

export const ADMIN_NOTIFICATION_TYPES = ["ADMIN_SLIP_SUBMITTED", "ADMIN_LICENSE_REQUESTED"] as const satisfies NotificationType[];

/**
 * Where a notification leads. `localized` paths get the viewer's locale prefix; admin paths do
 * not. Derived here rather than stored, so a row can never carry an arbitrary URL.
 */
export function notificationTarget(
  type: NotificationType,
  params: NotificationParams,
): { path: string; localized: boolean } {
  switch (type) {
    case "PRODUCT_UPDATED":
      return { path: "/downloads", localized: true };
    case "PAYMENT_APPROVED":
    case "PAYMENT_REJECTED":
      return params.orderNumber
        ? { path: `/orders/${encodeURIComponent(params.orderNumber)}`, localized: true }
        : { path: "/orders", localized: true };
    case "LICENSE_APPROVED":
    case "LICENSE_REJECTED":
      return { path: "/account/licenses", localized: true };
    case "ADMIN_SLIP_SUBMITTED":
      return { path: "/admin/payments", localized: false };
    case "ADMIN_LICENSE_REQUESTED":
      return { path: "/admin/licenses", localized: false };
  }
}

export const NOTIFICATION_PAGE_SIZE = 10;
/** Badge shows "9+" above this. */
export const UNREAD_BADGE_MAX = 9;
