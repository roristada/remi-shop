import "server-only";
import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma/client";

/** Verified auth user for this request (validated against Supabase Auth), or null. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

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
  if (!profile || profile.role !== "ADMIN") notFound();
  return profile;
}
