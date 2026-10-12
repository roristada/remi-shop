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
    where: { productId, addonProduct: { addonOnly: true } },
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

export type AddonCandidate = { id: string; name: string; imageUrl: string | null; price: number; status: string; folderId: string | null };

/**
 * Admin editor. Add-ons are set up from the add-on's side: whether this product is add-on-only,
 * the main products that sell it, and every product that can be a main (not add-on-only itself).
 * `offered` is the read-only list of add-on-only products this product sells, for main products.
 */
export async function getAddonEditorData(productId: string, now: Date = new Date()) {
  const [product, offered, mainLinks, mainCandidates] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { addonOnly: true, _count: { select: { variants: true } } } }),
    prisma.productAddon.findMany({
      where: { productId, addonProduct: { addonOnly: true } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { addonProduct: { select: { id: true, nameTH: true } } },
    }),
    prisma.productAddon.findMany({ where: { addonProductId: productId }, orderBy: { createdAt: "asc" }, select: { productId: true } }),
    // Main products: anything except itself and other add-on-only products (variants are fine).
    prisma.product.findMany({
      where: { id: { not: productId }, addonOnly: false },
      orderBy: [{ nameTH: "asc" }],
      take: 1000,
      select: {
        id: true,
        nameTH: true,
        folderId: true,
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
    addonOnly: product?.addonOnly ?? false,
    hasVariants: (product?._count.variants ?? 0) > 0,
    offered: offered.map((l) => ({ id: l.addonProduct.id, name: l.addonProduct.nameTH })),
    mainIds: mainLinks.map((l) => l.productId),
    mainCandidates: mainCandidates.map(
      (c): AddonCandidate => ({
        id: c.id,
        name: c.nameTH,
        imageUrl: c.images[0] ? previewImageSrc(c.images[0], "card") : null,
        price: calculateProductPrice(c, now).finalPrice,
        status: getProductStatus(c, now),
        folderId: c.folderId,
      }),
    ),
  };
}

export type AddonMainLink = { slug: string; name: string; imageUrl: string | null };

/** Published products that sell this add-on-only product, for its page ("buy it with ..."). */
export async function listAddonMains(addonProductId: string, locale: string): Promise<AddonMainLink[]> {
  const links = await prisma.productAddon.findMany({
    where: {
      addonProductId,
      product: { addonsEnabled: true, addonOnly: false, publishStatus: "PUBLISHED", category: { status: "ACTIVE" } },
    },
    orderBy: { createdAt: "asc" },
    take: 24,
    select: {
      product: {
        select: {
          slug: true,
          nameTH: true,
          nameEN: true,
          images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1, select: { imagePath: true, cardPath: true } },
        },
      },
    },
  });
  return links.map(({ product: p }) => ({
    slug: p.slug,
    name: localized(locale, p.nameTH, p.nameEN),
    imageUrl: p.images[0] ? previewImageSrc(p.images[0], "card") : null,
  }));
}
