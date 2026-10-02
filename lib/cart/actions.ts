"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { isUniqueViolation } from "@/lib/prisma/errors";
import { getOwnership } from "@/lib/orders/ownership";
import { evaluateLine, lineKey, type LineProblem } from "@/lib/orders/rules";
import { checkoutProductSelect, checkoutVariantSelect, getCartView, toCheckoutProduct } from "@/lib/cart/queries";
import { toLocale } from "@/lib/auth/redirect";
import { idSchema } from "@/lib/validation/product";
import { localized } from "@/i18n/localize";
import { previewImageSrc } from "@/lib/storage/public-url";

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

/** One line of the header mini-cart. Prices are server-calculated (satang). */
export type MiniCartLine = {
  key: string;
  name: string;
  variantName: string | null;
  imageUrl: string | null;
  finalPrice: number;
  unitPrice: number;
  problem: LineProblem | null;
};
export type MiniCart = { lines: MiniCartLine[]; total: number; hasProblems: boolean };

/** The header cart popover's contents, re-priced like the cart page; null for guests. */
export async function getMiniCart(locale: string): Promise<MiniCart | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const { lines, totals } = await getCartView(user.id, toLocale(locale));
  return {
    lines: lines.map((l) => ({
      key: lineKey(l.productId, l.variantId),
      name: l.name,
      variantName: l.variantName,
      imageUrl: l.image?.url ?? null,
      finalPrice: l.price.finalPrice,
      unitPrice: l.price.unitPrice,
      problem: l.problem,
    })),
    total: totals.total,
    hasProblems: lines.some((l) => l.problem !== null),
  };
}

/** Item count for the header badge; 0 for guests. */
export async function getCartCount(): Promise<number> {
  const user = await getCurrentUser();
  return user ? countCartItems(user.id) : 0;
}

/** Adds one line: the product, or one of its variants (`variantId`). Each variant is its own line. */
export async function addToCart(productId: string, variantId: string | null, locale: string): Promise<AddToCartResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!idSchema.safeParse(productId).success) return { ok: false, code: "UNAVAILABLE" };
  if (variantId !== null && !idSchema.safeParse(variantId).success) return { ok: false, code: "UNAVAILABLE" };

  const now = new Date();
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      ...checkoutProductSelect(now),
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { imagePath: true, cardPath: true } },
    },
  });
  if (!product) return { ok: false, code: "UNAVAILABLE" };
  // Scoped to the product: a variant id of another product matches nothing.
  const variant = variantId
    ? await prisma.productVariant.findFirst({ where: { id: variantId, productId }, select: checkoutVariantSelect(now) })
    : null;
  if (variantId && !variant) return { ok: false, code: "UNAVAILABLE" };

  const ownership = await getOwnership(user.id, [product.id], now);
  const { problem, price } = evaluateLine(toCheckoutProduct(product, variant), ownership, now);
  if (problem) return { ok: false, code: problem };

  try {
    const cart = await prisma.cart.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
      select: { id: true },
    });
    await prisma.cartItem.create({ data: { cartId: cart.id, productId: product.id, variantId: variant?.id ?? null } });
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
      name: variant
        ? `${localized(locale, product.nameTH, product.nameEN)} · ${localized(locale, variant.nameTH, variant.nameEN)}`
        : localized(locale, product.nameTH, product.nameEN),
      imageUrl: image ? previewImageSrc(image, "card") : null,
      finalPrice: price.finalPrice,
      unitPrice: price.unitPrice,
    },
    count: await countCartItems(user.id),
  };
}

export async function removeFromCart(productId: string, variantId: string | null = null): Promise<CartActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!idSchema.safeParse(productId).success) return { ok: true };
  if (variantId !== null && !idSchema.safeParse(variantId).success) return { ok: true };

  // Scoped to the caller's own cart; a foreign id simply matches nothing.
  await prisma.cartItem.deleteMany({ where: { productId, variantId, cart: { userId: user.id } } });
  revalidatePath("/[locale]/cart", "page");
  return { ok: true };
}
