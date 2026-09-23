import type { FieldErrors } from "@/lib/validation/auth";

/** Shared result shape for auth/profile form actions. Strings are `auth.errors.*` keys. */
export type FormState = {
  status: "idle" | "error" | "success";
  error?: string;
  fieldErrors?: FieldErrors;
  /** Echoed back so the form can keep the value after a failed submit. */
  email?: string;
};

export const initialFormState: FormState = { status: "idle" };
