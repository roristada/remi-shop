import type { z } from "zod";
import type { FieldErrors } from "@/lib/validation/auth";

/**
 * Result shape for admin server actions. `error` is a safe, user-facing message. A success
 * `message` is not shown (the change itself is visible) unless `notify` says the admin must
 * read it, e.g. something was skipped or still needs doing.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string; notify?: boolean }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

/** Success the admin needs to be told about (shown as a toast). */
export function okNotice<T>(data: T, message: string): ActionResult<T> {
  return { ok: true, data, message, notify: true };
}

export function fail(error: string, fieldErrors?: FieldErrors): { ok: false; error: string; fieldErrors?: FieldErrors } {
  return { ok: false, error, fieldErrors };
}

/** Field errors keyed by the full dotted path (e.g. `downloadLimit.custom`). */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    out[key] ??= issue.message;
  }
  return out;
}

export function invalid(error: z.ZodError) {
  return fail("กรุณาตรวจสอบข้อมูลที่กรอก", zodFieldErrors(error));
}

export function formString(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}
