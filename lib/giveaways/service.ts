import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { prisma } from "@/lib/prisma/client";
import { checkoutProductSelect, checkoutVariantSelect, toCheckoutProduct } from "@/lib/cart/queries";
import { getOwnership } from "@/lib/orders/ownership";
import { evaluateLine, generateOrderNumber, lineKey } from "@/lib/orders/rules";
import { fromHundredths, toHundredths } from "@/lib/pricing/calculate";
import { isSoldOut } from "@/lib/products/stock";
import { snapshotOrderCosts } from "@/lib/costs/service";
import { notifyUser } from "@/lib/notifications/service";
import { claimDeadline, giveawayPhase, isSubstituteAllowed, openSlots, pickRandom } from "@/lib/giveaways/rules";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export class GiveawayError extends Error {
  constructor(readonly code: "NOT_FOUND" | "NOT_CLOSED" | "NOTHING_TO_DRAW") {
    super(code);
  }
}

export type DrawResult = { drawn: number; unfilled: number };

/**
 * Draws winners for every open prize slot, in prize order: the first draw after registration
 * closes, and later redraws of slots whose winner missed the claim deadline (those winners are
 * forfeited here). Candidates are entries that are not disqualified and have never won in this
 * giveaway, so each customer wins at most one prize. Picks use crypto.randomInt on the server.
 */
export async function drawWinnersTx(tx: Tx, giveawayId: string, now: Date): Promise<DrawResult> {
  // Row lock: two clicks (or two admins) draw one after the other, and the second sees the first's winners.
  await tx.$queryRaw`select id from giveaways where id = ${giveawayId}::uuid for update`;
  const giveaway = await tx.giveaway.findUnique({
    where: { id: giveawayId },
    select: {
      slug: true,
      isPublished: true,
      startsAt: true,
      endsAt: true,
      drawnAt: true,
      prizes: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          winnerCount: true,
          product: { select: { nameTH: true, nameEN: true, price: true } },
          variant: { select: { nameTH: true, nameEN: true, price: true } },
        },
      },
    },
  });
  if (!giveaway) throw new GiveawayError("NOT_FOUND");
  const phase = giveawayPhase(giveaway, now);
  if (phase !== "CLOSED" && phase !== "DRAWN") throw new GiveawayError("NOT_CLOSED");

  await tx.giveawayWinner.updateMany({
    where: { giveawayId, claimedAt: null, forfeitedAt: null, claimDeadline: { lte: now } },
    data: { forfeitedAt: now },
  });
  const winners = await tx.giveawayWinner.findMany({
    where: { giveawayId },
    select: { prizeId: true, claimedAt: true, forfeitedAt: true, claimDeadline: true },
  });
  const entries = await tx.giveawayEntry.findMany({
    where: { giveawayId, disqualifiedAt: null, winner: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true },
  });

  let pool = entries;
  let drawn = 0;
  let unfilled = 0;
  const deadline = claimDeadline(now);
  for (const prize of giveaway.prizes) {
    const slots = openSlots(
      prize.winnerCount,
      winners.filter((w) => w.prizeId === prize.id),
      now,
    );
    const picked = pickRandom(pool, slots, randomInt);
    unfilled += slots - picked.length;
    if (picked.length === 0) continue;
    const pickedIds = new Set(picked.map((e) => e.id));
    pool = pool.filter((e) => !pickedIds.has(e.id));

    const prizeValue = fromHundredths(toHundredths(prize.variant?.price ?? prize.product.price));
    await tx.giveawayWinner.createMany({
      data: picked.map((e) => ({ giveawayId, prizeId: prize.id, entryId: e.id, prizeValue, drawnAt: now, claimDeadline: deadline })),
    });
    const params = {
      productNameTH: prize.variant ? `${prize.product.nameTH} (${prize.variant.nameTH})` : prize.product.nameTH,
      productNameEN: prize.variant ? `${prize.product.nameEN} (${prize.variant.nameEN})` : prize.product.nameEN,
      giveawaySlug: giveaway.slug,
    };
    for (const e of picked) await notifyUser(tx, e.userId, "GIVEAWAY_WON", params);
    drawn += picked.length;
  }

  if (drawn === 0 && giveaway.drawnAt) throw new GiveawayError("NOTHING_TO_DRAW");
  if (!giveaway.drawnAt) await tx.giveaway.update({ where: { id: giveawayId }, data: { drawnAt: now } });
  return { drawn, unfilled };
}

export class ClaimError extends Error {
  constructor(readonly code: "NOT_FOUND" | "NOT_CLAIMABLE" | "PRIZE_UNAVAILABLE" | "SUBSTITUTE_NOT_ALLOWED") {
    super(code);
  }
}

/** Why the prize itself cannot be delivered to this winner (then a substitute may be picked). */
export type PrizeBlock = "OWNED" | "IN_ORDER" | "SOLD_OUT" | "GONE" | null;

type Line = { productId: string; variantId: string | null };

async function loadLine(tx: Db, line: Line, now: Date) {
  const product = await tx.product.findUnique({ where: { id: line.productId }, select: checkoutProductSelect(now) });
  if (!product) return null;
  const variant = line.variantId ? await tx.productVariant.findUnique({ where: { id: line.variantId }, select: checkoutVariantSelect(now) }) : null;
  if (line.variantId && (!variant || variant.productId !== product.id)) return null;
  return { product, variant };
}

/**
 * Whether the prize line can go to this customer. Sale status and the publish switch are ignored
 * on purpose (a giveaway-only product can be a draft); ownership and stock still apply.
 */
export async function prizeBlock(tx: Db, userId: string, prize: Line, now: Date): Promise<PrizeBlock> {
  const loaded = await loadLine(tx, prize, now);
  if (!loaded) return "GONE";
  const ownership = await getOwnership(userId, [prize.productId], now, tx);
  const key = lineKey(prize.productId, prize.variantId);
  if (ownership.owned.has(key)) return "OWNED";
  if (ownership.inOpenOrder.has(key)) return "IN_ORDER";
  if (isSoldOut(toCheckoutProduct(loaded.product, loaded.variant).stock)) return "SOLD_OUT";
  return null;
}

/**
 * Delivers a won prize as a COMPLETED 0-baht order. `substitute` is honoured only when the prize
 * itself cannot be delivered; it must be a line on sale now whose current price is at most the
 * prize's value. Returns the order number.
 */
export async function claimPrizeTx(tx: Tx, winnerId: string, userId: string, substitute: Line | null, now: Date): Promise<string> {
  // Same per-customer lock as checkout: an order placed at the same moment cannot double-own a line.
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
  const winner = await tx.giveawayWinner.findUnique({
    where: { id: winnerId },
    select: {
      claimedAt: true,
      forfeitedAt: true,
      claimDeadline: true,
      prizeValue: true,
      entry: { select: { userId: true } },
      prize: { select: { productId: true, variantId: true } },
    },
  });
  if (!winner || winner.entry.userId !== userId) throw new ClaimError("NOT_FOUND");
  if (winner.claimedAt || winner.forfeitedAt || now >= winner.claimDeadline) throw new ClaimError("NOT_CLAIMABLE");

  const prize: Line = { productId: winner.prize.productId, variantId: winner.prize.variantId };
  const block = await prizeBlock(tx, userId, prize, now);
  const isPrize = !substitute || (substitute.productId === prize.productId && substitute.variantId === prize.variantId);
  let line: Line;
  if (isPrize) {
    if (block) throw new ClaimError("PRIZE_UNAVAILABLE");
    line = prize;
  } else {
    if (!block) throw new ClaimError("SUBSTITUTE_NOT_ALLOWED");
    line = substitute;
  }

  // Limited stock: queue behind checkouts of the same line, like checkout does.
  await tx.$queryRaw`select id from products where id = ${line.productId}::uuid and stock_limit is not null for update`;
  if (line.variantId) await tx.$queryRaw`select id from product_variants where id = ${line.variantId}::uuid and stock_limit is not null for update`;
  const loaded = await loadLine(tx, line, now);
  if (!loaded) throw new ClaimError(isPrize ? "PRIZE_UNAVAILABLE" : "SUBSTITUTE_NOT_ALLOWED");
  const checked = toCheckoutProduct(loaded.product, loaded.variant);
  const ownership = await getOwnership(userId, [line.productId], now, tx);
  const evaluated = evaluateLine(checked, ownership, now);
  if (!isPrize) {
    if (evaluated.problem || loaded.product.addonOnly || !isSubstituteAllowed(evaluated.price.finalPrice, toHundredths(winner.prizeValue))) {
      throw new ClaimError("SUBSTITUTE_NOT_ALLOWED");
    }
  } else if (evaluated.problem === "OWNED" || evaluated.problem === "IN_ORDER" || evaluated.problem === "SOLD_OUT") {
    throw new ClaimError("PRIZE_UNAVAILABLE");
  }

  // Snapshot of what the prize is worth; the customer pays nothing.
  const unitPrice = evaluated.price.unitPrice;
  const order = await tx.order.create({
    data: {
      orderNumber: generateOrderNumber(now, randomBytes(6)),
      userId,
      subtotal: fromHundredths(unitPrice),
      discount: fromHundredths(unitPrice),
      total: "0.00",
      status: "COMPLETED",
      paidAt: now,
      expiresAt: now,
      items: {
        create: {
          productId: loaded.product.id,
          variantId: loaded.variant?.id ?? null,
          productNameTHSnapshot: loaded.product.nameTH,
          productNameENSnapshot: loaded.product.nameEN,
          variantNameTHSnapshot: loaded.variant?.nameTH ?? null,
          variantNameENSnapshot: loaded.variant?.nameEN ?? null,
          productVersionSnapshot: loaded.product.versions[0]?.versionNumber ?? null,
          unitPrice: fromHundredths(unitPrice),
          discount: fromHundredths(unitPrice),
          finalPrice: "0.00",
        },
      },
    },
    select: { id: true, orderNumber: true },
  });
  // Conditional, so a double click cannot claim twice; a prize is not a sale, so soldCount is left alone.
  const { count } = await tx.giveawayWinner.updateMany({
    where: { id: winnerId, claimedAt: null, forfeitedAt: null, claimDeadline: { gt: now } },
    data: { claimedAt: now, orderId: order.id },
  });
  if (count !== 1) throw new ClaimError("NOT_CLAIMABLE");
  await snapshotOrderCosts(tx, order.id, now);
  return order.orderNumber;
}
