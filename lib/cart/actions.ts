"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isUniqueViolation } from "@/lib/prisma/errors";
import { getOwnership } from "@/lib/orders/ownership";
import { evaluateLine, type LineProblem } from "@/lib/orders/rules";
import { checkoutProductSelect, toCheckoutProduct } from "@/lib/cart/queries";
import { idSchema } from "@/lib/validation/product";
import { localized } from "@/i18n/localize";
import { previewImageUrl } from "@/lib/storage/public-url";

/** Codes map to `cart.errors.*` translation keys. */
export type CartActionResult = { ok: true } | { ok: false; code: LineProblem | "LOGIN_REQUIRED" | "ERROR" };

/** What the header cart popover shows after an add. Price is computed server-side (satang). */
export type AddedCartItem = { name: string; imageUrl: string | null; finalPrice: number; unitPrice: number };
export type AddToCartResult =
  | { ok: true; item: AddedCartItem; count: number }
  | { ok: false; code: LineProblem | "LOGIN_REQUIRED" | "ERROR" };

async function countCartItems(userId: string): Promise<number> {
  return prisma.cartItem.count({ where: { cart: { userId } } });
}

/** Item count for the header badge; 0 for guests. */
export async function getCartCount(): Promise<number> {
  const user = await getCurrentUser();
  return user ? countCartItems(user.id) : 0;
}

export async function addToCart(productId: string, locale: string): Promise<AddToCartResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!idSchema.safeParse(productId).success) return { ok: false, code: "UNAVAILABLE" };

  const now = new Date();
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      ...checkoutProductSelect(now),
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { imagePath: true } },
    },
  });
  if (!product) return { ok: false, code: "UNAVAILABLE" };

  const ownership = await getOwnership(user.id, [product.id], now);
  const { problem, price } = evaluateLine(toCheckoutProduct(product), ownership, now);
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
  const image = product.images[0];
  return {
    ok: true,
    item: {
      name: localized(locale, product.nameTH, product.nameEN),
      imageUrl: image ? previewImageUrl(image.imagePath) : null,
      finalPrice: price.finalPrice,
      unitPrice: price.unitPrice,
    },
    count: await countCartItems(user.id),
  };
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
