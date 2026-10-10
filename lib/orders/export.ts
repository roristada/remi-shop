import type { OrderStatus } from "@/lib/generated/prisma/enums";

// Pure helpers for the admin order list and its CSV export (no DB).

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "WAITING_REVIEW",
  "PAYMENT_REJECTED",
  "COMPLETED",
  "CANCELLED",
] as const satisfies readonly OrderStatus[];

export const ORDER_STATUS_LABEL_TH: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "รอชำระเงิน",
  WAITING_REVIEW: "รอตรวจสลิป",
  PAYMENT_REJECTED: "สลิปไม่ผ่าน",
  COMPLETED: "สำเร็จ",
  CANCELLED: "ยกเลิก",
};

export const DELIVERY_FILTERS = ["email", "emailPending", "emailSent"] as const;
export type DeliveryFilter = (typeof DELIVERY_FILTERS)[number];

export type AdminOrderFilters = {
  status?: OrderStatus;
  /** Order number or customer email (contains, case-insensitive). */
  q?: string;
  /** Inclusive bounds of the Bangkok calendar days picked in the form. */
  from?: Date;
  to?: Date;
  /**
   * "email": product orders with a line that has no file yet, so the store emails it.
   * "emailPending" / "emailSent": of those, paid ones not yet / already marked as emailed.
   */
  delivery?: DeliveryFilter;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `<input type="date">` value as the start or end of that day in Asia/Bangkok. */
function bangkokDay(value: string | undefined, edge: "start" | "end"): Date | undefined {
  if (!value || !DATE.test(value)) return undefined;
  const d = new Date(`${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}+07:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseAdminOrderFilters(sp: SearchParams): AdminOrderFilters {
  const status = ORDER_STATUSES.find((s) => s === one(sp.status));
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  const delivery = DELIVERY_FILTERS.find((d) => d === one(sp.delivery));
  return { status, q, from: bangkokDay(one(sp.from), "start"), to: bangkokDay(one(sp.to), "end"), delivery, page };
}

/** Filters as query params (for pagination and the export link). */
export function adminOrderParams(sp: SearchParams): Record<string, string | undefined> {
  const keep = (k: string) => one(sp[k]) || undefined;
  return { status: keep("status"), q: keep("q"), from: keep("from"), to: keep("to"), delivery: keep("delivery") };
}

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field. Text starting with a formula character is prefixed with `'` so Excel or Sheets
 * never evaluates customer-supplied values (CSV injection).
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 BOM so Excel opens Thai text correctly; CRLF line endings per RFC 4180. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
