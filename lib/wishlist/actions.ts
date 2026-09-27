"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isUniqueViolation } from "@/lib/prisma/errors";
import { idSchema } from "@/lib/validation/product";

export type WishlistActionResult = { ok: true; wishlisted: boolean } | { ok: false; code: "LOGIN_REQUIRED" | "ERROR" };

/** Toggles membership. Not perfectly atomic, but idempotent: a race just re-settles on the unique constraint. */
export async function toggleWishlist(productId: string): Promise<WishlistActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!idSchema.safeParse(productId).success) return { ok: false, code: "ERROR" };

  const key = { userId_productId: { userId: user.id, productId } };
  const existing = await prisma.wishlist.findUnique({ where: key, select: { userId: true } });

  try {
    if (existing) await prisma.wishlist.delete({ where: key });
    else await prisma.wishlist.create({ data: { userId: user.id, productId } });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      console.error("toggleWishlist failed", { userId: user.id, productId, error });
      return { ok: false, code: "ERROR" };
    }
  }

  revalidatePath("/[locale]/wishlist", "page");
  return { ok: true, wishlisted: !existing };
}
