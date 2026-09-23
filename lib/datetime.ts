// Business timezone. Thailand has no DST, so a fixed +07:00 offset is exact.
export const BUSINESS_TIMEZONE = "Asia/Bangkok";
const BANGKOK_OFFSET = "+07:00";
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Parses an `<input type="datetime-local">` value as Bangkok wall-clock time.
 * Returns null for empty input, undefined for an invalid value.
 */
export function parseBangkokDateTimeLocal(value: string): Date | null | undefined {
  const v = value.trim();
  if (v === "") return null;
  if (!DATETIME_LOCAL.test(v)) return undefined;
  const date = new Date(`${v}:00${BANGKOK_OFFSET}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Formats a Date as a Bangkok `datetime-local` value (for form defaults). */
export function toBangkokDateTimeLocal(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 16);
}

/** Human-readable Bangkok date/time for display. */
/** Defaults to Thai with Gregorian years, matching the admin date picker. */
export function formatBangkokDateTime(date: Date | null | undefined, locale = "th-TH-u-ca-gregory"): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat(locale, {
    timeZone: BUSINESS_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
