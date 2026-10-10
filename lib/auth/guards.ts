import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma/client";
import { clientMeta, logSecurityEvent } from "@/lib/security/log";

/** Verified auth user for this request (validated against Supabase Auth), or null. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/**
 * Cheap hint with no network call: a Supabase auth cookie is present. Used only to skip fetching
 * per-user UI for guests; never for authorization (the cookie may be expired or forged).
 */
export async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies();
  return store.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

/** Profile row from the DB. Role is read from here, never from the client or JWT metadata. */
export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  return prisma.profile.findUnique({ where: { id: user.id } });
});

export async function requireUser(loginPath = "/th/login") {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  return user;
}

/**
 * Non-admins get a 404 so the admin area isn't revealed.
 * Call in EVERY admin page, route handler and server action — not just the layout.
 */
export async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "ADMIN") {
    // Anonymous hits are routine (bots, stale tabs); a signed-in non-admin is worth noting.
    if (profile) logSecurityEvent("admin access denied", { userId: profile.id, ...clientMeta(await headers()) });
    notFound();
  }
  return profile;
}
