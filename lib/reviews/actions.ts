"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { zodFieldErrors, type ActionResult, fail, ok } from "@/lib/actions/result";
import type { FieldErrors } from "@/lib/validation/auth";
import { idSchema } from "@/lib/validation/product";
import { reviewInputSchema } from "@/lib/reviews/validation";
import { getReviewEligibility, findReviewableOrder, listProductReviews } from "@/lib/reviews/queries";
import { reviewerName, type ReviewEligibility } from "@/lib/reviews/rules";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Codes map to `shop.reviews.errors.*` translation keys. */
export type ReviewErrorCode = "LOGIN_REQUIRED" | "INVALID" | "NOT_ELIGIBLE" | "ERROR";

export type ReviewResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: ReviewErrorCode; fieldErrors?: FieldErrors };

type Tx = Prisma.TransactionClient;

/** Re-derives the product's rating totals from its visible reviews (called inside the writing transaction). */
async function syncProductRating(tx: Tx, productId: string) {
  const agg = await tx.review.aggregate({
    where: { productId, isHidden: false },
    _count: { _all: true },
    _sum: { rating: true },
  });
  await tx.product.update({
    where: { id: productId },
    data: { ratingCount: agg._count._all, ratingSum: agg._sum.rating ?? 0 },
  });
}

function revalidateReviews() {
  revalidatePath("/[locale]/product/[slug]", "page");
  revalidatePath("/[locale]/shop", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/admin/reviews");
}

/**
 * Creates the customer's review, or updates it if they already wrote one. Only a verified buyer
 * (completed product order, inside the 30-day window) may create; editing needs no open window.
 */
export async function submitReview(input: unknown): Promise<ReviewResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "LOGIN_REQUIRED" };
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID", fieldErrors: zodFieldErrors(parsed.error) };
  const { productId, rating, body } = parsed.data;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const existing = await tx.review.findUnique({
        where: { productId_userId: { productId, userId: user.id } },
        select: { id: true },
      });
      if (existing) {
        await tx.review.update({ where: { id: existing.id }, data: { rating, body } });
      } else {
        const order = await findReviewableOrder(user.id, productId, new Date());
        if (!order) return "NOT_ELIGIBLE" as const;
        await tx.review.create({ data: { productId, userId: user.id, orderId: order.id, rating, body } });
      }
      await syncProductRating(tx, productId);
      return "OK" as const;
    });
    if (outcome === "NOT_ELIGIBLE") return { ok: false, code: "NOT_ELIGIBLE" };
  } catch (error) {
    console.error("Review submit failed", { userId: user.id, productId, error });
    return { ok: false, code: "ERROR" };
  }

  console.info("Review saved", { userId: user.id, productId, rating });
  revalidateReviews();
  return { ok: true, data: undefined };
}

/** Public: one more page of reviews for the product page's "load more". */
export async function loadMoreReviews(productId: string, page: number) {
  if (!idSchema.safeParse(productId).success || !Number.isInteger(page) || page < 1 || page > 10_000) {
    return { rows: [], hasMore: false };
  }
  const { rows, hasMore } = await listProductReviews(productId, page);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      name: reviewerName(r.user.displayName, ""),
    })),
    hasMore,
  };
}

/** What the product page's review button should show for the current viewer. */
export async function getMyReviewState(
  productId: string,
): Promise<{ state: ReviewEligibility; existing?: { rating: number; body: string } }> {
  if (!idSchema.safeParse(productId).success) return { state: "NOT_PURCHASED" };
  const user = await getCurrentUser();
  const result = await getReviewEligibility(user?.id ?? null, productId);
  return { state: result.state, existing: "existing" in result ? result.existing : undefined };
}


/** Admin: hide or show a review (it stays in the database; the product's rating follows). */
export async function setReviewHidden(reviewId: string, hidden: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(reviewId).success) return fail("ไม่พบรีวิว");
  try {
    await prisma.$transaction(async (tx) => {
      const review = await tx.review.update({ where: { id: reviewId }, data: { isHidden: hidden }, select: { productId: true } });
      await syncProductRating(tx, review.productId);
    });
  } catch (error) {
    console.error("Review visibility change failed", { reviewId, error });
    return fail("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
  }
  console.info("Review visibility changed", { reviewId, hidden });
  revalidateReviews();
  return ok(undefined, hidden ? "ซ่อนรีวิวแล้ว" : "แสดงรีวิวแล้ว");
}
