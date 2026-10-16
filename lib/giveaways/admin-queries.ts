import "server-only";
import { prisma } from "@/lib/prisma/client";
import { toHundredths } from "@/lib/pricing/calculate";
import { getProductStatus } from "@/lib/products/status";
import { previewImageSrc } from "@/lib/storage/public-url";

const MAX_ADMIN_GIVEAWAYS = 200;
/** Products offered in the prize picker (a single seller's catalog fits). */
const MAX_PRIZE_CANDIDATES = 1000;

const firstImage = { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }], take: 1, select: { imagePath: true, cardPath: true } };

export function listAdminGiveaways() {
  return prisma.giveaway.findMany({
    orderBy: [{ endsAt: "desc" }],
    take: MAX_ADMIN_GIVEAWAYS,
    select: {
      id: true,
      slug: true,
      titleTH: true,
      imagePath: true,
      startsAt: true,
      endsAt: true,
      isPublished: true,
      drawnAt: true,
      _count: { select: { entries: { where: { disqualifiedAt: null } }, winners: { where: { claimedAt: { not: null } } } } },
    },
  });
}

export async function getAdminGiveaway(id: string) {
  return prisma.giveaway.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      titleTH: true,
      titleEN: true,
      descriptionTH: true,
      descriptionEN: true,
      imagePath: true,
      startsAt: true,
      endsAt: true,
      isPublished: true,
      drawnAt: true,
      updatedAt: true,
      prizes: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, productId: true, variantId: true, winnerCount: true },
      },
      _count: { select: { entries: true } },
    },
  });
}

/** One line the admin can give away: a product without variants, or one variant. Prices in satang. */
export type PrizeCandidate = {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  imageUrl: string | null;
  /** Regular price (no discount): what the prize is worth. */
  price: number;
  /** ACTIVE etc. A prize does not need to be on sale. */
  status: string;
};

export const prizeKey = (productId: string, variantId: string | null) => `${productId}:${variantId ?? ""}`;

/** Every product line for the prize picker, newest first. */
export async function listPrizeCandidates(now: Date = new Date()): Promise<PrizeCandidate[]> {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_PRIZE_CANDIDATES,
    select: {
      id: true,
      nameTH: true,
      price: true,
      publishStatus: true,
      saleStartAt: true,
      saleEndAt: true,
      images: firstImage,
      variants: { orderBy: { sortOrder: "asc" }, select: { id: true, nameTH: true, price: true, isActive: true } },
    },
  });
  return products.flatMap((p): PrizeCandidate[] => {
    const base = {
      productId: p.id,
      name: p.nameTH,
      imageUrl: p.images[0] ? previewImageSrc(p.images[0], "card") : null,
      status: getProductStatus(p, now),
    };
    if (p.variants.length === 0) {
      return [{ ...base, key: prizeKey(p.id, null), variantId: null, variantName: null, price: toHundredths(p.price) }];
    }
    return p.variants.map((v) => ({
      ...base,
      key: prizeKey(p.id, v.id),
      variantId: v.id,
      variantName: v.nameTH,
      price: toHundredths(v.price),
      status: v.isActive ? base.status : "DISABLED",
    }));
  });
}

export const ENTRIES_PAGE_SIZE = 50;

/** Entrants, newest first, with an optional email/name search. */
export async function listGiveawayEntries(giveawayId: string, page: number, q?: string) {
  const where = {
    giveawayId,
    ...(q
      ? { user: { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { displayName: { contains: q, mode: "insensitive" as const } }] } }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.giveawayEntry.count({ where }),
    prisma.giveawayEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ENTRIES_PAGE_SIZE,
      take: ENTRIES_PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        disqualifiedAt: true,
        winner: { select: { id: true } },
        user: { select: { id: true, email: true, displayName: true } },
      },
    }),
  ]);
  return { total, rows, pageCount: Math.max(1, Math.ceil(total / ENTRIES_PAGE_SIZE)) };
}

/** Every drawn winner (forfeited ones too, as the draw's record), in draw order. */
export function listGiveawayWinners(giveawayId: string) {
  return prisma.giveawayWinner.findMany({
    where: { giveawayId },
    orderBy: [{ drawnAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      prizeId: true,
      prizeValue: true,
      drawnAt: true,
      claimDeadline: true,
      claimedAt: true,
      forfeitedAt: true,
      order: { select: { orderNumber: true, items: { take: 1, select: { productNameTHSnapshot: true, variantNameTHSnapshot: true, productId: true, variantId: true } } } },
      entry: { select: { user: { select: { id: true, email: true, displayName: true } } } },
      prize: { select: { productId: true, variantId: true, product: { select: { nameTH: true } }, variant: { select: { nameTH: true } } } },
    },
  });
}

/** Entrants the next draw can pick: not disqualified and never drawn. */
export function countDrawCandidates(giveawayId: string) {
  return prisma.giveawayEntry.count({ where: { giveawayId, disqualifiedAt: null, winner: null } });
}
