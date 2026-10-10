import "server-only";
import { prisma } from "@/lib/prisma/client";
import { localized } from "@/i18n/localize";
import { checkoutProductSelect, toCheckoutProduct } from "@/lib/cart/queries";
import { getOwnership } from "@/lib/orders/ownership";
import { evaluateLine, lineKey } from "@/lib/orders/rules";
import type { ProductPrice } from "@/lib/pricing/calculate";
import { calculateProductPrice } from "@/lib/pricing/calculate";
import { getProductStatus } from "@/lib/products/status";
import { previewImageSrc } from "@/lib/storage/public-url";
import { MAX_ADDONS } from "@/lib/addons/rules";

/** What the product page shows for one add-on. `state` mirrors the buy button's states. */
export type StorefrontAddon = {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: ProductPrice;
  state: "guest" | "available" | "inCart" | "owned" | "inOrder";
};

/**
 * The add-ons offered on this product's page, at their own current price. Add-ons that cannot be
 * bought right now (off sale, sold out, variant-only) are left out, so they can never be picked.
 */
export async function listStorefrontAddons(productId: string, userId: string | null, locale: string, now: Date): Promise<StorefrontAddon[]> {
  const main = await prisma.product.findUnique({ where: { id: productId }, select: { addonsEnabled: true } });
  if (!main?.addonsEnabled) return [];

  const links = await prisma.productAddon.findMany({
    where: { productId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: MAX_ADDONS,
    select: {
      addonProduct: {
        select: {
          ...checkoutProductSelect(now),
          images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { imagePath: true, cardPath: true } },
        },
      },
    },
  });
  const products = links.map((l) => l.addonProduct);
  if (products.length === 0) return [];

  const ids = products.map((p) => p.id);
  const [ownership, cartLines] = await Promise.all([
    userId ? getOwnership(userId, ids, now) : null,
    userId ? prisma.cartItem.findMany({ where: { productId: { in: ids }, variantId: null, cart: { userId } }, select: { productId: true } }) : [],
  ]);
  const inCart = new Set(cartLines.map((c) => c.productId));

  const out: StorefrontAddon[] = [];
  for (const p of products) {
    const line = toCheckoutProduct(p, null);
    const key = lineKey(p.id, null);
    const { problem, price } = evaluateLine(line, ownership ?? { owned: new Set(), inOpenOrder: new Set() }, now);
    let state: StorefrontAddon["state"];
    if (ownership?.owned.has(key)) state = "owned";
    else if (ownership?.inOpenOrder.has(key)) state = "inOrder";
    else if (problem) continue;
    else state = !ownership ? "guest" : inCart.has(p.id) ? "inCart" : "available";
    const image = p.images[0];
    out.push({
      productId: p.id,
      slug: p.slug,
      name: localized(locale, p.nameTH, p.nameEN),
      imageUrl: image ? previewImageSrc(image, "card") : null,
      price,
      state,
    });
  }
  return out;
}

export type AddonCandidate = { id: string; name: string; imageUrl: string | null; price: number; status: string };

/** Admin editor: this product's add-on list, and every product that can be one (no variants, not itself). */
export async function getAddonEditorData(productId: string, now: Date = new Date()) {
  const [product, links, candidates] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { addonsEnabled: true } }),
    prisma.productAddon.findMany({
      where: { productId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { addonProductId: true },
    }),
    prisma.product.findMany({
      where: { id: { not: productId }, variants: { none: {} } },
      orderBy: [{ nameTH: "asc" }],
      take: 1000,
      select: {
        id: true,
        nameTH: true,
        price: true,
        discountPercent: true,
        discountStartAt: true,
        discountEndAt: true,
        publishStatus: true,
        saleStartAt: true,
        saleEndAt: true,
        images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { imagePath: true, cardPath: true } },
      },
    }),
  ]);
  return {
    enabled: product?.addonsEnabled ?? false,
    selectedIds: links.map((l) => l.addonProductId),
    candidates: candidates.map(
      (c): AddonCandidate => ({
        id: c.id,
        name: c.nameTH,
        imageUrl: c.images[0] ? previewImageSrc(c.images[0], "card") : null,
        price: calculateProductPrice(c, now).finalPrice,
        status: getProductStatus(c, now),
      }),
    ),
  };
}
