"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { toLocale } from "@/lib/auth/redirect";
import { prisma } from "@/lib/prisma/client";
import { fromHundredths } from "@/lib/pricing/calculate";
import { checkoutProductSelect, toCheckoutProduct } from "@/lib/cart/queries";
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

      const cartProductIds = (
        await tx.cartItem.findMany({ where: { cart: { userId: user.id } }, select: { productId: true } })
      ).map((i) => i.productId);
      if (cartProductIds.length === 0) throw new CheckoutError("EMPTY");
      // Checkouts of the same limited product queue here (id order, so no deadlock), and the
      // stock count below then sees every order committed before us: the last unit sells once.
      await tx.$queryRaw`select id from products where id = any(${cartProductIds}::uuid[]) and stock_limit is not null order by id for update`;

      const items = await tx.cartItem.findMany({
        where: { cart: { userId: user.id } },
        select: { product: { select: checkoutProductSelect(now) } },
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

/** Customer cancels their own unpaid order: no slip yet (before the deadline), or a license order whose slip was rejected. */
export async function cancelOrder(orderNumberInput: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  const parsed = orderNumberSchema.safeParse(orderNumberInput);
  if (!user || !parsed.success) return { ok: false };
  const now = new Date();

  const { count } = await prisma.order.updateMany({
    where: {
      orderNumber: parsed.data,
      userId: user.id,
      // Same states as canCustomerCancel(); a slip under review cannot be cancelled from here.
      OR: [
        { status: "PAYMENT_REJECTED", kind: "LICENSE" },
        { status: "PENDING_PAYMENT", paymentStatus: null, expiresAt: { gt: now } },
      ],
    },
    data: { status: "CANCELLED", cancelledAt: now },
  });
  if (count === 0) return { ok: false };
  console.info("Order cancelled by customer", { orderNumber: parsed.data, userId: user.id });
  revalidatePath("/[locale]/orders/[orderNumber]", "page");
  return { ok: true };
}

export type ReorderErrorCode = "LOGIN_REQUIRED" | "NOT_ALLOWED" | "NOTHING_TO_ORDER" | "ERROR";

/**
 * After a rejected slip: puts the order's products that can still be bought back into the cart
 * and opens it. Each line is re-validated (sale window, ownership, price comes from the catalog
 * at checkout), so nothing from the old order is trusted.
 */
export async function reorderRejectedOrder(orderNumberInput: string, localeInput: string): Promise<{ ok: false; code: ReorderErrorCode }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  const parsed = orderNumberSchema.safeParse(orderNumberInput);
  if (!parsed.success) return { ok: false, code: "NOT_ALLOWED" };
  const locale = toLocale(localeInput);
  const now = new Date();

  const order = await prisma.order.findFirst({
    where: { orderNumber: parsed.data, userId: user.id, kind: "PRODUCT", status: "PAYMENT_REJECTED" },
    select: { items: { select: { productId: true } } },
  });
  if (!order) return { ok: false, code: "NOT_ALLOWED" };

  try {
    const productIds = order.items.map((i) => i.productId);
    const [products, ownership] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: productIds } }, select: checkoutProductSelect(now) }),
      getOwnership(user.id, productIds, now),
    ]);
    const buyable = products.filter((p) => evaluateLine(toCheckoutProduct(p), ownership, now).problem === null);
    if (buyable.length === 0) return { ok: false, code: "NOTHING_TO_ORDER" };

    const cart = await prisma.cart.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
      select: { id: true },
    });
    await prisma.cartItem.createMany({
      data: buyable.map((p) => ({ cartId: cart.id, productId: p.id })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("Reorder failed", { orderNumber: parsed.data, userId: user.id, error });
    return { ok: false, code: "ERROR" };
  }

  console.info("Rejected order re-added to cart", { orderNumber: parsed.data, userId: user.id });
  revalidatePath("/[locale]/cart", "page");
  redirect(`/${locale}/cart`);
}
