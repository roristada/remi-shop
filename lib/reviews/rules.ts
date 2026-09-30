import type { OrderKind, OrderStatus } from "@/lib/generated/prisma/enums";

// Pure review rules (no DB): who may review and how ratings are summarised.

export const REVIEW_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const REVIEW_WINDOW_MS = REVIEW_WINDOW_DAYS * DAY_MS;

export const REVIEW_BODY_MAX = 1000;
export const REVIEWS_PAGE_SIZE = 5;

type ReviewableOrder = { status: OrderStatus; kind: OrderKind; paidAt: Date | null; createdAt: Date };

/** The window opens when the store approved the payment (falls back to the order date). */
export function reviewDeadline(order: Pick<ReviewableOrder, "paidAt" | "createdAt">): Date {
  return new Date((order.paidAt ?? order.createdAt).getTime() + REVIEW_WINDOW_MS);
}

/** Only a paid product order counts as a verified purchase, and only for 30 days. */
export function canReviewOrder(order: ReviewableOrder, now: Date = new Date()): boolean {
  return order.kind === "PRODUCT" && order.status === "COMPLETED" && now < reviewDeadline(order);
}

export type ReviewEligibility = "LOGIN" | "NOT_PURCHASED" | "CAN_REVIEW" | "REVIEWED" | "EXPIRED";

/** Average rating to one decimal; 0 when there are no reviews. */
export function ratingAverage(sum: number, count: number): number {
  return count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
}

export type RatingBucket = { stars: 1 | 2 | 3 | 4 | 5; count: number; percent: number };

/** Five buckets, 5 stars first. Percentages are whole numbers that add up to 100 (or all 0). */
export function ratingDistribution(counts: Partial<Record<number, number>>): RatingBucket[] {
  const stars = [5, 4, 3, 2, 1] as const;
  const total = stars.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const raw = stars.map((s) => {
    const count = counts[s] ?? 0;
    const exact = total > 0 ? (count / total) * 100 : 0;
    return { stars: s, count, exact, percent: Math.floor(exact) };
  });
  // Largest-remainder rounding so the bars never add up to 99.
  let left = total > 0 ? 100 - raw.reduce((n, b) => n + b.percent, 0) : 0;
  for (const b of [...raw].sort((a, b) => b.exact - b.percent - (a.exact - a.percent))) {
    if (left <= 0) break;
    b.percent += 1;
    left -= 1;
  }
  return raw.map(({ stars, count, percent }) => ({ stars, count, percent }));
}

/** Public name on a review: first name only, never the email. */
export function reviewerName(displayName: string | null, fallback: string): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first.slice(0, 20) : fallback;
}
