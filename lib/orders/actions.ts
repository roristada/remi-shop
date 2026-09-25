"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { toLocale } from "@/lib/auth/redirect";
import { prisma } from "@/lib/prisma/client";
import { fromHundredths } from "@/lib/pricing/calculate";
import { CHECKOUT_PRODUCT_SELECT, toCheckoutProduct } from "@/lib/cart/queries";
import { cancelExpiredOrders, getOwnership } from "@/lib/orders/ownership";
import { evaluateLine, generateOrderNumber, orderTotals } from "@/lib/orders/rules";
import { orderNumberSchema } from "@/lib/orders/validation";

export type CheckoutErrorCode = "LOGIN_REQUIRED" | "EMPTY" | "CART_CHANGED" | "PRICE_CHANGED" | "ERROR";
export type CheckoutResult = { ok: false; code: CheckoutErrorCode };

class CheckoutError extends Error {
  constructor(readonly code: CheckoutErrorCode) {
    super(code);
  }
}

/**
 * Creates an order from the caller's cart. Every line is re-priced and re-validated inside the
 * transaction; `expectedTotal` (satang) is only compared, so the customer is never charged an
 * amount they did not see. Redirects to the order page on success.
 */
export async function checkout(localeInput: string, expectedTotal: number): Promise<CheckoutResult> {
  const locale = toLocale(localeInput);
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!Number.isSafeInteger(expectedTotal) || expectedTotal < 0) return { ok: false, code: "PRICE_CHANGED" };

  const now = new Date();
  let orderNumber: string;
  try {
    orderNumber = await prisma.$transaction(async (tx) => {
      // One checkout at a time per customer, so two tabs cannot both order the same product.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`;
      await cancelExpiredOrders(user.id, now, tx);

      const items = await tx.cartItem.findMany({
        where: { cart: { userId: user.id } },
        select: { product: { select: CHECKOUT_PRODUCT_SELECT } },
      });
      if (items.length === 0) throw new CheckoutError("EMPTY");

      const products = items.map((i) => i.product);
      const ownership = await getOwnership(
        user.id,
        products.map((p) => p.id),
        now,
        tx,
      );
      const lines = products.map((p) => evaluateLine(toCheckoutProduct(p), ownership, now));
      if (lines.some((l) => l.problem)) throw new CheckoutError("CART_CHANGED");

      const totals = orderTotals(lines);
      if (totals.total !== expectedTotal) throw new CheckoutError("PRICE_CHANGED");

      const settings = await tx.storeSetting.findUnique({ where: { id: 1 }, select: { orderExpiryMinutes: true } });
      const expiryMinutes = settings?.orderExpiryMinutes ?? 60;

      const order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(now, randomBytes(6)),
          userId: user.id,
          subtotal: fromHundredths(totals.subtotal),
          discount: fromHundredths(totals.discount),
          total: fromHundredths(totals.total),
          expiresAt: new Date(now.getTime() + expiryMinutes * 60_000),
          items: {
            create: products.map((p, i) => ({
              productId: p.id,
              productNameTHSnapshot: p.nameTH,
              productNameENSnapshot: p.nameEN,
              productVersionSnapshot: p.versions[0]?.versionNumber ?? null,
              unitPrice: fromHundredths(lines[i].price.unitPrice),
              discount: fromHundredths(lines[i].price.discount),
              finalPrice: fromHundredths(lines[i].price.finalPrice),
            })),
          },
        },
        select: { id: true, orderNumber: true },
      });

      await tx.cartItem.deleteMany({ where: { cart: { userId: user.id } } });
      console.info("Order created", { orderId: order.id, userId: user.id, items: products.length });
      return order.orderNumber;
    });
  } catch (error) {
    if (error instanceof CheckoutError) return { ok: false, code: error.code };
    console.error("Checkout failed", { userId: user.id, error });
    return { ok: false, code: "ERROR" };
  }

  revalidatePath("/[locale]/cart", "page");
  redirect(`/${locale}/orders/${orderNumber}`);
}

/** Customer cancels their own unpaid order (no slip uploaded yet). */
export async function cancelOrder(localeInput: string, orderNumberInput: string): Promise<{ ok: boolean }> {
  const locale = toLocale(localeInput);
  const user = await getCurrentUser();
  const parsed = orderNumberSchema.safeParse(orderNumberInput);
  if (!user || !parsed.success) return { ok: false };

  const { count } = await prisma.order.updateMany({
    where: { orderNumber: parsed.data, userId: user.id, status: "PENDING_PAYMENT", paymentStatus: null },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  if (count === 0) return { ok: false };
  console.info("Order cancelled by customer", { orderNumber: parsed.data, userId: user.id });
  revalidatePath(`/${locale}/orders/${parsed.data}`);
  return { ok: true };
}
