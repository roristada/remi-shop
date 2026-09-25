"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isUniqueViolation } from "@/lib/prisma/errors";
import { getOwnership } from "@/lib/orders/ownership";
import { evaluateLine, type LineProblem } from "@/lib/orders/rules";
import { CHECKOUT_PRODUCT_SELECT, toCheckoutProduct } from "@/lib/cart/queries";
import { idSchema } from "@/lib/validation/product";

/** Codes map to `cart.errors.*` translation keys. */
export type CartActionResult = { ok: true } | { ok: false; code: LineProblem | "LOGIN_REQUIRED" | "ERROR" };

export async function addToCart(productId: string): Promise<CartActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!idSchema.safeParse(productId).success) return { ok: false, code: "UNAVAILABLE" };

  const now = new Date();
  const product = await prisma.product.findUnique({ where: { id: productId }, select: CHECKOUT_PRODUCT_SELECT });
  if (!product) return { ok: false, code: "UNAVAILABLE" };

  const ownership = await getOwnership(user.id, [product.id], now);
  const { problem } = evaluateLine(toCheckoutProduct(product), ownership, now);
  if (problem) return { ok: false, code: problem };

  try {
    const cart = await prisma.cart.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
      select: { id: true },
    });
    await prisma.cartItem.create({ data: { cartId: cart.id, productId: product.id } });
  } catch (error) {
    // Already in the cart (or a concurrent add won the race): adding is idempotent.
    if (!isUniqueViolation(error)) {
      console.error("addToCart failed", { userId: user.id, productId, error });
      return { ok: false, code: "ERROR" };
    }
  }

  revalidatePath("/[locale]/cart", "page");
  return { ok: true };
}

export async function removeFromCart(productId: string): Promise<CartActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!idSchema.safeParse(productId).success) return { ok: true };

  // Scoped to the caller's own cart; a foreign productId simply matches nothing.
  await prisma.cartItem.deleteMany({ where: { productId, cart: { userId: user.id } } });
  revalidatePath("/[locale]/cart", "page");
  return { ok: true };
}
