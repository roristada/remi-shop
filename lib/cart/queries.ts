import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { localized } from "@/i18n/localize";
import { getOwnership } from "@/lib/orders/ownership";
import { evaluateLine, lineKey, orderTotals, type CheckoutLine, type CheckoutProduct } from "@/lib/orders/rules";
import { previewImageUrl } from "@/lib/storage/public-url";
import {
  isSoldOut,
  stockTakenCountSelect,
  toStockInfo,
  variantStockTakenCountSelect,
  type StockInfo,
} from "@/lib/products/stock";
import type { ProductPrice } from "@/lib/pricing/calculate";

/** Everything checkout needs to re-price and re-validate a product. Never trust cart contents as-is. */
export function checkoutProductSelect(now: Date) {
  return {
    id: true,
    slug: true,
    nameTH: true,
    nameEN: true,
    price: true,
    discountPercent: true,
    discountStartAt: true,
    discountEndAt: true,
    publishStatus: true,
    saleStartAt: true,
    saleEndAt: true,
    category: { select: { status: true } },
    versions: { where: { isLatest: true }, select: { versionNumber: true }, take: 1 },
    stockLimit: true,
    // `variants` counts every variant, active or not: having any means a variant must be chosen.
    _count: { select: { ...stockTakenCountSelect(now), variants: true } },
  } satisfies Prisma.ProductSelect;
}

/** The variant's own price, discount and stock for re-validating a variant line. */
export function checkoutVariantSelect(now: Date) {
  return {
    id: true,
    productId: true,
    nameTH: true,
    nameEN: true,
    price: true,
    discountPercent: true,
    discountStartAt: true,
    discountEndAt: true,
    stockLimit: true,
    isActive: true,
    _count: { select: variantStockTakenCountSelect(now) },
  } satisfies Prisma.ProductVariantSelect;
}

export type CheckoutProductRow = Prisma.ProductGetPayload<{ select: ReturnType<typeof checkoutProductSelect> }>;
export type CheckoutVariantRow = Prisma.ProductVariantGetPayload<{ select: ReturnType<typeof checkoutVariantSelect> }>;

/**
 * One line to evaluate. With a variant, its price, discount and stock replace the product's; a
 * variant of another product is never trusted (it becomes an inactive, unbuyable line).
 */
export function toCheckoutProduct(row: CheckoutProductRow, variant: CheckoutVariantRow | null = null): CheckoutProduct {
  const base = {
    id: row.id,
    publishStatus: row.publishStatus,
    saleStartAt: row.saleStartAt,
    saleEndAt: row.saleEndAt,
    categoryActive: row.category.status === "ACTIVE",
    variantRequired: row._count.variants > 0,
  };
  if (!variant) {
    return {
      ...base,
      price: row.price,
      discountPercent: row.discountPercent,
      discountStartAt: row.discountStartAt,
      discountEndAt: row.discountEndAt,
      stock: toStockInfo(row.stockLimit, row._count.orderItems),
      variantId: null,
      variantActive: true,
    };
  }
  return {
    ...base,
    price: variant.price,
    discountPercent: variant.discountPercent,
    discountStartAt: variant.discountStartAt,
    discountEndAt: variant.discountEndAt,
    stock: toStockInfo(variant.stockLimit, variant._count.orderItems),
    variantId: variant.id,
    variantActive: variant.isActive && variant.productId === row.id,
  };
}

export type CartLineView = CheckoutLine & {
  slug: string;
  name: string;
  variantName: string | null;
  image: { url: string; alt: string } | null;
};

/** What the buy button on a product page should offer this visitor for one line. */
export type PurchaseState = "guest" | "available" | "inCart" | "owned" | "inOrder" | "soldOut";

/** One buyable choice on the product page: the product itself, or one active variant. */
export type PurchaseOption = {
  variantId: string | null;
  name: string | null;
  price: ProductPrice;
  stock: StockInfo;
  state: PurchaseState;
};

/**
 * The product page's buy choices, each priced and checked server-side. A product without
 * variants has one option (variantId null); one whose variants are all switched off has none.
 */
export async function getPurchaseOptions(
  userId: string | null,
  productId: string,
  locale: string,
  now: Date,
): Promise<PurchaseOption[]> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      ...checkoutProductSelect(now),
      variants: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: checkoutVariantSelect(now) },
    },
  });
  if (!product) return [];

  const [ownership, cartLines] = userId
    ? await Promise.all([
        getOwnership(userId, [productId], now),
        prisma.cartItem.findMany({ where: { productId, cart: { userId } }, select: { variantId: true } }),
      ])
    : [null, []];
  const inCart = new Set(cartLines.map((c) => lineKey(productId, c.variantId)));

  const lines = product._count.variants > 0 ? product.variants.map((v) => ({ variant: v })) : [{ variant: null }];
  return lines.map(({ variant }) => {
    const line = toCheckoutProduct(product, variant);
    const key = lineKey(productId, line.variantId);
    const { price } = evaluateLine(line, ownership ?? { owned: new Set(), inOpenOrder: new Set() }, now);
    let state: PurchaseState;
    if (!ownership) state = isSoldOut(line.stock) ? "soldOut" : "guest";
    else if (ownership.owned.has(key)) state = "owned";
    else if (ownership.inOpenOrder.has(key)) state = "inOrder";
    else if (isSoldOut(line.stock)) state = "soldOut";
    else state = inCart.has(key) ? "inCart" : "available";
    return {
      variantId: line.variantId,
      name: variant ? localized(locale, variant.nameTH, variant.nameEN) : null,
      price,
      stock: line.stock,
      state,
    };
  });
}

/** The customer's cart with server-calculated prices and a problem flag per line. */
export async function getCartView(userId: string, locale: string, now: Date = new Date()) {
  const items = await prisma.cartItem.findMany({
    where: { cart: { userId } },
    orderBy: { createdAt: "asc" },
    select: {
      product: {
        select: {
          ...checkoutProductSelect(now),
          images: {
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            take: 1,
            select: { imagePath: true, altTextTH: true, altTextEN: true },
          },
        },
      },
      variant: { select: checkoutVariantSelect(now) },
    },
  });

  const ownership = await getOwnership(
    userId,
    items.map((i) => i.product.id),
    now,
  );
  const lines: CartLineView[] = items.map(({ product, variant }) => {
    const name = localized(locale, product.nameTH, product.nameEN);
    const image = product.images[0];
    return {
      ...evaluateLine(toCheckoutProduct(product, variant), ownership, now),
      slug: product.slug,
      name,
      variantName: variant ? localized(locale, variant.nameTH, variant.nameEN) : null,
      image: image
        ? { url: previewImageUrl(image.imagePath), alt: localized(locale, image.altTextTH, image.altTextEN) || name }
        : null,
    };
  });

  return { lines, totals: orderTotals(lines) };
}
