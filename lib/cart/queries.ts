import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { localized } from "@/i18n/localize";
import { getOwnership } from "@/lib/orders/ownership";
import { evaluateLine, orderTotals, type CheckoutLine, type CheckoutProduct } from "@/lib/orders/rules";
import { previewImageUrl } from "@/lib/storage/public-url";

/** Everything checkout needs to re-price and re-validate a product. Never trust cart contents as-is. */
export const CHECKOUT_PRODUCT_SELECT = {
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
} satisfies Prisma.ProductSelect;

export type CheckoutProductRow = Prisma.ProductGetPayload<{ select: typeof CHECKOUT_PRODUCT_SELECT }>;

export function toCheckoutProduct(row: CheckoutProductRow): CheckoutProduct {
  return { ...row, categoryActive: row.category.status === "ACTIVE" };
}

export type CartLineView = CheckoutLine & {
  slug: string;
  name: string;
  image: { url: string; alt: string } | null;
};

/** What the buy button on a product page should offer this visitor. */
export type PurchaseState = "guest" | "available" | "inCart" | "owned" | "inOrder";

export async function getPurchaseState(userId: string | null, productId: string, now: Date): Promise<PurchaseState> {
  if (!userId) return "guest";
  const [ownership, inCart] = await Promise.all([
    getOwnership(userId, [productId], now),
    prisma.cartItem.count({ where: { productId, cart: { userId } } }),
  ]);
  if (ownership.owned.has(productId)) return "owned";
  if (ownership.inOpenOrder.has(productId)) return "inOrder";
  return inCart > 0 ? "inCart" : "available";
}

/** The customer's cart with server-calculated prices and a problem flag per line. */
export async function getCartView(userId: string, locale: string, now: Date = new Date()) {
  const items = await prisma.cartItem.findMany({
    where: { cart: { userId } },
    orderBy: { createdAt: "asc" },
    select: {
      product: {
        select: {
          ...CHECKOUT_PRODUCT_SELECT,
          images: {
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            take: 1,
            select: { imagePath: true, altTextTH: true, altTextEN: true },
          },
        },
      },
    },
  });

  const ownership = await getOwnership(
    userId,
    items.map((i) => i.product.id),
    now,
  );
  const lines: CartLineView[] = items.map(({ product }) => {
    const name = localized(locale, product.nameTH, product.nameEN);
    const image = product.images[0];
    return {
      ...evaluateLine(toCheckoutProduct(product), ownership, now),
      slug: product.slug,
      name,
      image: image
        ? { url: previewImageUrl(image.imagePath), alt: localized(locale, image.altTextTH, image.altTextEN) || name }
        : null,
    };
  });

  return { lines, totals: orderTotals(lines) };
}
