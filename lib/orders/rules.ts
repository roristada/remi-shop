import type { OrderKind, OrderStatus } from "@/lib/generated/prisma/enums";
import { calculateProductPrice, type PriceInput, type ProductPrice } from "@/lib/pricing/calculate";
import { getProductStatus, type ProductStatusInput } from "@/lib/products/status";
import { isSoldOut, type StockInfo } from "@/lib/products/stock";

// Pure checkout rules (no DB). Personal purchases are once per customer per line: a product
// without variants, or one variant of a product (a customer may own several variants).

/** Why a cart line cannot be bought right now. */
export type LineProblem = "UNAVAILABLE" | "OWNED" | "IN_ORDER" | "SOLD_OUT";

/**
 * One purchasable line. For a variant line the price, discount and stock are the variant's;
 * the sale window and category are always the product's.
 */
export type CheckoutProduct = PriceInput &
  ProductStatusInput & {
    id: string;
    categoryActive: boolean;
    /** null = unlimited stock. */
    stock: StockInfo;
    variantId: string | null;
    /** The product has variants, so a line without one cannot be bought. */
    variantRequired: boolean;
    /** false for a variant the admin switched off. Always true without a variant. */
    variantActive: boolean;
  };

/** Identity of a purchasable line: the variant when there is one, else the product. */
export function lineKey(productId: string, variantId: string | null): string {
  return variantId ? `v:${variantId}` : `p:${productId}`;
}

export type OwnershipContext = {
  /** Line keys (see lineKey) in a COMPLETED order of this customer. */
  owned: ReadonlySet<string>;
  /** Line keys in an order that is still open (awaiting payment or review). */
  inOpenOrder: ReadonlySet<string>;
};

export type CheckoutLine = {
  productId: string;
  variantId: string | null;
  price: ProductPrice;
  problem: LineProblem | null;
};

export function evaluateLine(product: CheckoutProduct, ctx: OwnershipContext, now: Date): CheckoutLine {
  const price = calculateProductPrice(product, now);
  const key = lineKey(product.id, product.variantId);
  let problem: LineProblem | null = null;
  if (ctx.owned.has(key)) problem = "OWNED";
  else if (ctx.inOpenOrder.has(key)) problem = "IN_ORDER";
  else if (
    !product.categoryActive ||
    getProductStatus(product, now) !== "ACTIVE" ||
    (product.variantRequired && !product.variantId) ||
    !product.variantActive
  ) {
    problem = "UNAVAILABLE";
  } else if (isSoldOut(product.stock)) problem = "SOLD_OUT";
  return { productId: product.id, variantId: product.variantId, price, problem };
}

export type OrderTotals = { subtotal: number; discount: number; total: number };

/** Sums the lines that can be bought (all amounts in satang). */
export function orderTotals(lines: CheckoutLine[]): OrderTotals {
  let subtotal = 0;
  let discount = 0;
  for (const l of lines) {
    if (l.problem) continue;
    subtotal += l.price.unitPrice;
    discount += l.price.discount;
  }
  return { subtotal, discount, total: subtotal - discount };
}

export type OrderStateInput = { status: OrderStatus; expiresAt: Date; paymentStatus: string | null; kind?: OrderKind };

/**
 * A rejected slip ends a product order: the customer must order again (the UAT rule). License
 * orders are the exception, because re-ordering would mean a new request and a new approval.
 */
export function canRetryAfterRejection(order: Pick<OrderStateInput, "status" | "kind">): boolean {
  return order.status === "PAYMENT_REJECTED" && order.kind === "LICENSE";
}

/** A PENDING_PAYMENT order with no slip past its deadline. */
export function isOrderExpired(order: OrderStateInput, now: Date): boolean {
  return order.status === "PENDING_PAYMENT" && order.paymentStatus === null && now >= order.expiresAt;
}

/** Open orders reserve their products: the customer may not buy the same product again meanwhile. */
export function isOrderOpen(order: OrderStateInput, now: Date): boolean {
  if (order.status === "WAITING_REVIEW" || canRetryAfterRejection(order)) return true;
  return order.status === "PENDING_PAYMENT" && !isOrderExpired(order, now);
}

// Crockford base32 without I, L, O, U: easy to read out over chat or the phone.
const ORDER_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** e.g. "RS260926-7K3QX9": Bangkok date + 6 random characters. Uniqueness is enforced by the DB. */
export function generateOrderNumber(now: Date, randomBytes: Uint8Array): string {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const ymd = bangkok.toISOString().slice(2, 10).replaceAll("-", "");
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ORDER_ALPHABET[randomBytes[i] % ORDER_ALPHABET.length];
  return `RS${ymd}-${suffix}`;
}
