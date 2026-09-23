"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma/client";
import { requireUser } from "@/lib/auth/guards";
import { authErrorKey } from "@/lib/auth/errors";
import { safeNextPath, siteUrl, toLocale } from "@/lib/auth/redirect";
import type { FormState } from "@/lib/auth/form-state";
import {
  emailOnlySchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
  toFieldErrors,
} from "@/lib/validation/auth";

/** Email links land on /auth/confirm, which verifies the token and forwards to `next`. */
function confirmUrl(next: string) {
  return `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`;
}

function field(formData: FormData, name: string) {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = toLocale(field(formData, "locale"));
  const parsed = loginSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), email: field(formData, "email") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { status: "error", error: authErrorKey(error), email: parsed.data.email };

  redirect(safeNextPath(field(formData, "next"), `/${locale}/account`));
}

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = toLocale(field(formData, "locale"));
  const parsed = registerSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
    displayName: field(formData, "displayName"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: toFieldErrors(parsed.error), email: field(formData, "email") };
  }

  const { email, password, displayName } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmUrl(`/${locale}/account?notice=verified`),
      data: displayName ? { display_name: displayName } : undefined,
    },
  });
  // An already-registered email returns success (no error) — intentionally indistinguishable.
  if (error) return { status: "error", error: authErrorKey(error), email };

  return { status: "success", email };
}

export async function resendVerification(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = toLocale(field(formData, "locale"));
  const parsed = emailOnlySchema.safeParse({ email: field(formData, "email") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: confirmUrl(`/${locale}/account?notice=verified`) },
  });
  if (error) return { status: "error", error: authErrorKey(error), email: parsed.data.email };

  return { status: "success", email: parsed.data.email };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = toLocale(field(formData, "locale"));
  const parsed = emailOnlySchema.safeParse({ email: field(formData, "email") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: confirmUrl(`/${locale}/reset-password`),
  });
  // Only surface rate limiting; never reveal whether the email exists.
  if (error && authErrorKey(error) === "rate_limited") {
    return { status: "error", error: "rate_limited", email: parsed.data.email };
  }
  return { status: "success", email: parsed.data.email };
}

/** Requires the recovery session created by /auth/confirm. */
export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = toLocale(field(formData, "locale"));
  const parsed = resetPasswordSchema.safeParse({
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { status: "error", error: "session_expired" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", error: authErrorKey(error) };

  redirect(`/${locale}/account?notice=passwordUpdated`);
}

export async function logout(formData: FormData) {
  const locale = toLocale(field(formData, "locale"));
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${locale}`);
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = toLocale(field(formData, "locale"));
  const user = await requireUser(`/${locale}/login`);

  const parsed = profileSchema.safeParse({ displayName: field(formData, "displayName") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  // Identity comes from the verified session, never from the form.
  await prisma.profile.update({
    where: { id: user.id },
    data: { displayName: parsed.data.displayName },
  });
  revalidatePath(`/${locale}/account`, "layout");
  return { status: "success" };
}

/** Sends a reset link to the signed-in user's own email. */
export async function requestOwnPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const locale = toLocale(field(formData, "locale"));
  const user = await requireUser(`/${locale}/login`);
  if (!user.email) return { status: "error", error: "unknown" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: confirmUrl(`/${locale}/reset-password`),
  });
  if (error) return { status: "error", error: authErrorKey(error) };
  return { status: "success" };
}
