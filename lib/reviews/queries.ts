import "server-only";
import { prisma } from "@/lib/prisma/client";
import { canReviewOrder, ratingDistribution, REVIEWS_PAGE_SIZE, reviewDeadline, type ReviewEligibility } from "@/lib/reviews/rules";

/** Rating breakdown for the product page (visible reviews only). */
export async function getReviewSummary(productId: string) {
  const [product, groups] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { ratingCount: true, ratingSum: true } }),
    prisma.review.groupBy({ by: ["rating"], where: { productId, isHidden: false }, _count: { _all: true } }),
  ]);
  const counts: Partial<Record<number, number>> = {};
  for (const g of groups) counts[g.rating] = g._count._all;
  return {
    count: product?.ratingCount ?? 0,
    sum: product?.ratingSum ?? 0,
    distribution: ratingDistribution(counts),
  };
}

/** One page of visible reviews, newest first. */
export async function listProductReviews(productId: string, page: number) {
  const where = { productId, isHidden: false };
  const [total, rows] = await prisma.$transaction([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * REVIEWS_PAGE_SIZE,
      take: REVIEWS_PAGE_SIZE,
      select: { id: true, rating: true, body: true, createdAt: true, user: { select: { displayName: true } } },
    }),
  ]);
  return { total, rows, hasMore: page * REVIEWS_PAGE_SIZE < total };
}

/** A completed product order of this customer containing the product and still inside the window. */
export async function findReviewableOrder(userId: string, productId: string, now: Date) {
  const orders = await prisma.order.findMany({
    where: { userId, kind: "PRODUCT", status: "COMPLETED", items: { some: { productId } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, kind: true, paidAt: true, createdAt: true },
  });
  return orders.find((o) => canReviewOrder(o, now)) ?? null;
}

export async function getReviewEligibility(userId: string | null, productId: string, now: Date = new Date()) {
  if (!userId) return { state: "LOGIN" as ReviewEligibility };
  const [existing, orders] = await Promise.all([
    prisma.review.findUnique({
      where: { productId_userId: { productId, userId } },
      select: { id: true, rating: true, body: true },
    }),
    prisma.order.findMany({
      where: { userId, kind: "PRODUCT", status: "COMPLETED", items: { some: { productId } } },
      select: { status: true, kind: true, paidAt: true, createdAt: true },
    }),
  ]);
  if (existing) return { state: "REVIEWED" as ReviewEligibility, existing };
  if (orders.length === 0) return { state: "NOT_PURCHASED" as ReviewEligibility };
  const open = orders.some((o) => canReviewOrder(o, now));
  return { state: (open ? "CAN_REVIEW" : "EXPIRED") as ReviewEligibility };
}

/**
 * Per product of an order: whether it can be reviewed now, was already reviewed, or the window
 * closed. Used by the order page and the popup.
 */
export async function getOrderReviewStates(
  userId: string,
  order: { status: import("@/lib/generated/prisma/enums").OrderStatus; kind: import("@/lib/generated/prisma/enums").OrderKind; paidAt: Date | null; createdAt: Date },
  productIds: string[],
  now: Date = new Date(),
) {
  const open = canReviewOrder(order, now);
  const reviewed = await prisma.review.findMany({
    where: { userId, productId: { in: productIds } },
    select: { productId: true },
  });
  const done = new Set(reviewed.map((r) => r.productId));
  return {
    deadline: reviewDeadline(order),
    byProduct: new Map(
      productIds.map((id) => [id, done.has(id) ? ("REVIEWED" as const) : open ? ("CAN_REVIEW" as const) : ("EXPIRED" as const)]),
    ),
  };
}

const ADMIN_PAGE_SIZE = 20;

export async function listReviewsForAdmin(page: number, hiddenOnly: boolean) {
  const where = hiddenOnly ? { isHidden: true } : {};
  const [total, rows] = await prisma.$transaction([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        body: true,
        isHidden: true,
        createdAt: true,
        product: { select: { id: true, nameTH: true } },
        user: { select: { email: true, displayName: true } },
      },
    }),
  ]);
  return { total, rows, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}
