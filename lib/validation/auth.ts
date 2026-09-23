import { z } from "zod";

// Error messages are translation keys under `auth.errors.*`.

const email = z.string().trim().toLowerCase().pipe(z.email("invalid_email").max(254, "invalid_email"));

const password = z.string().min(8, "password_too_short").max(72, "password_too_long");

const displayName = z
  .string()
  .trim()
  .max(50, "display_name_too_long")
  .transform((v) => (v === "" ? null : v));

export const loginSchema = z.object({
  email,
  // Don't enforce length on login — just require something.
  password: z.string().min(1, "invalid_credentials").max(72, "invalid_credentials"),
});

export const registerSchema = z.object({ email, password, displayName });

export const emailOnlySchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, {
    message: "password_mismatch",
    path: ["confirmPassword"],
  });

export const profileSchema = z.object({ displayName });

export type FieldErrors = Partial<Record<string, string>>;

/** First error message per field. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
