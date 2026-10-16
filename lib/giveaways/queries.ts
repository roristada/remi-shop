import "server-only";
import { prisma } from "@/lib/prisma/client";
import { localized } from "@/i18n/localize";
import { checkoutProductSelect, checkoutVariantSelect, toCheckoutProduct } from "@/lib/cart/queries";
import { getOwnership } from "@/lib/orders/ownership";
import { evaluateLine } from "@/lib/orders/rules";
import { toHundredths } from "@/lib/pricing/calculate";
import { previewImageSrc, previewImageUrl } from "@/lib/storage/public-url";
import { entrantName, giveawayPhase, isSubstituteAllowed, maskWinnerName, winnerState, type WinnerState } from "@/lib/giveaways/rules";
import { prizeBlock, type PrizeBlock } from "@/lib/giveaways/service";

const MAX_PUBLIC_GIVEAWAYS = 60;
/** Products scanned for substitutes (published catalog; a single seller's fits). */
const MAX_SUBSTITUTE_SCAN = 1000;
const MAX_SUBSTITUTES = 120;

const firstImage = { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }], take: 1, select: { imagePath: true, cardPath: true } };

/** Published giveaways for /giveaways: running ones first (by closing time), then past results. */
export async function listPublicGiveaways(locale: string, now: Date) {
  const rows = await prisma.giveaway.findMany({
    where: { isPublished: true },
    orderBy: { endsAt: "desc" },
    take: MAX_PUBLIC_GIVEAWAYS,
    select: {
      slug: true,
      titleTH: true,
      titleEN: true,
      imagePath: true,
      startsAt: true,
      endsAt: true,
      isPublished: true,
      drawnAt: true,
      _count: { select: { entries: true } },
      prizes: { orderBy: { sortOrder: "asc" }, select: { winnerCount: true } },
    },
  });
  const cards = rows.map((g) => ({
    slug: g.slug,
    title: localized(locale, g.titleTH, g.titleEN),
    imageUrl: g.imagePath ? previewImageUrl(g.imagePath) : null,
    startsAt: g.startsAt,
    endsAt: g.endsAt,
    phase: giveawayPhase(g, now),
    entries: g._count.entries,
    winners: g.prizes.reduce((n, p) => n + p.winnerCount, 0),
  }));
  const running = cards.filter((c) => c.phase !== "DRAWN").sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());
  return { running, past: cards.filter((c) => c.phase === "DRAWN") };
}

export type PublicGiveawayCard = Awaited<ReturnType<typeof listPublicGiveaways>>["running"][number];

/** One published giveaway with its prizes, results and the viewer's own entry / win. `includeDraft`: admin preview. */
export async function getPublicGiveaway(slug: string, locale: string, userId: string | null, now: Date, includeDraft = false) {
  const g = await prisma.giveaway.findFirst({
    where: { slug, ...(includeDraft ? {} : { isPublished: true }) },
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
      _count: { select: { entries: true } },
      prizes: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          winnerCount: true,
          product: { select: { slug: true, nameTH: true, nameEN: true, publishStatus: true, images: firstImage } },
          variant: { select: { nameTH: true, nameEN: true, imagePath: true } },
        },
      },
    },
  });
  if (!g) return null;

  const prizes = g.prizes.map((p) => ({
    id: p.id,
    winnerCount: p.winnerCount,
    name: localized(locale, p.product.nameTH, p.product.nameEN),
    variantName: p.variant ? localized(locale, p.variant.nameTH, p.variant.nameEN) : null,
    imageUrl: p.variant?.imagePath
      ? previewImageUrl(p.variant.imagePath)
      : p.product.images[0]
        ? previewImageSrc(p.product.images[0], "card")
        : null,
    // Giveaway-only (draft) products have no public page.
    productSlug: p.product.publishStatus === "PUBLISHED" ? p.product.slug : null,
  }));
  const prizeById = new Map(prizes.map((p) => [p.id, p]));

  const [entry, winnerRows] = await Promise.all([
    userId
      ? prisma.giveawayEntry.findUnique({ where: { giveawayId_userId: { giveawayId: g.id, userId } }, select: { id: true, disqualifiedAt: true } })
      : null,
    g.drawnAt
      ? prisma.giveawayWinner.findMany({
          where: { giveawayId: g.id, forfeitedAt: null },
          orderBy: { drawnAt: "asc" },
          select: {
            id: true,
            prizeId: true,
            claimedAt: true,
            forfeitedAt: true,
            claimDeadline: true,
            entry: { select: { userId: true, user: { select: { displayName: true, email: true } } } },
          },
        })
      : [],
  ]);

  const fallbackName = locale === "en" ? "Customer" : "ลูกค้า";
  const prizeLabel = (id: string) => {
    const p = prizeById.get(id);
    return p ? (p.variantName ? `${p.name} · ${p.variantName}` : p.name) : "";
  };
  const winners = winnerRows.map((w) => ({
    id: w.id,
    prizeName: prizeLabel(w.prizeId),
    name: maskWinnerName(entrantName(w.entry.user.displayName, w.entry.user.email), fallbackName),
    state: winnerState(w, now),
  }));

  const mine = userId ? await getMyWin(g.id, userId, now) : null;

  return {
    id: g.id,
    slug: g.slug,
    title: localized(locale, g.titleTH, g.titleEN),
    description: localized(locale, g.descriptionTH, g.descriptionEN),
    imageUrl: g.imagePath ? previewImageUrl(g.imagePath) : null,
    startsAt: g.startsAt,
    endsAt: g.endsAt,
    phase: giveawayPhase(g, now),
    entries: g._count.entries,
    prizes,
    winners,
    entered: entry !== null,
    disqualified: entry?.disqualifiedAt != null,
    mine: mine && { ...mine, prize: prizeById.get(mine.prizeId) ?? null },
  };
}

export type PublicGiveaway = NonNullable<Awaited<ReturnType<typeof getPublicGiveaway>>>;

/** The viewer's win in this giveaway (any state), and whether the prize itself can still be delivered. */
async function getMyWin(giveawayId: string, userId: string, now: Date) {
  const w = await prisma.giveawayWinner.findFirst({
    where: { giveawayId, entry: { userId } },
    select: {
      id: true,
      prizeId: true,
      prizeValue: true,
      claimedAt: true,
      forfeitedAt: true,
      claimDeadline: true,
      order: { select: { orderNumber: true } },
      prize: { select: { productId: true, variantId: true } },
    },
  });
  if (!w) return null;
  const state: WinnerState = winnerState(w, now);
  const block: PrizeBlock = state === "PENDING" ? await prizeBlock(prisma, userId, w.prize, now) : null;
  return {
    winnerId: w.id,
    prizeId: w.prizeId,
    state,
    claimDeadline: w.claimDeadline,
    prizeValue: toHundredths(w.prizeValue),
    orderNumber: w.order?.orderNumber ?? null,
    block,
  };
}

export type SubstituteOption = {
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  imageUrl: string | null;
  /** Current price in satang (after any active discount). */
  price: number;
};

/**
 * Lines the winner may take instead of the prize: on sale now, not add-on-only, not owned or in
 * an open order, in stock, and priced at most `prizeValue` (satang). Cheapest last-resort list.
 */
export async function listSubstitutes(userId: string, prizeValue: number, locale: string, now: Date): Promise<SubstituteOption[]> {
  const products = await prisma.product.findMany({
    where: { publishStatus: "PUBLISHED", addonOnly: false, category: { status: "ACTIVE" } },
    orderBy: { publishedAt: "desc" },
    take: MAX_SUBSTITUTE_SCAN,
    select: { ...checkoutProductSelect(now), images: firstImage, variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { ...checkoutVariantSelect(now), imagePath: true } } },
  });
  const ownership = await getOwnership(
    userId,
    products.map((p) => p.id),
    now,
  );
  const out: SubstituteOption[] = [];
  for (const p of products) {
    const image = p.images[0] ? previewImageSrc(p.images[0], "card") : null;
    const lines = p.variants.length === 0 ? [null] : p.variants;
    for (const v of lines) {
      const line = evaluateLine(toCheckoutProduct(p, v), ownership, now);
      if (line.problem || !isSubstituteAllowed(line.price.finalPrice, prizeValue)) continue;
      out.push({
        productId: p.id,
        variantId: v?.id ?? null,
        name: localized(locale, p.nameTH, p.nameEN),
        variantName: v ? localized(locale, v.nameTH, v.nameEN) : null,
        imageUrl: v?.imagePath ? previewImageUrl(v.imagePath) : image,
        price: line.price.finalPrice,
      });
    }
  }
  // Closest to the prize's value first.
  return out.sort((a, b) => b.price - a.price).slice(0, MAX_SUBSTITUTES);
}
