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

/**
 * Days after approval when an unreviewed purchase gets an in-site reminder. The last one comes
 * two days before the window closes (a reminder on day 30 would land after it).
 */
export const REVIEW_REMINDER_DAYS = [7, 15, REVIEW_WINDOW_DAYS - 2] as const;

/**
 * The reminder to send now for one purchase, or null. Only the latest due stage is sent (someone
 * returning on day 20 gets one reminder, not two), never one already sent or older than one sent.
 */
export function dueReviewReminder(
  order: Pick<ReviewableOrder, "paidAt" | "createdAt">,
  sentStages: readonly number[],
  now: Date = new Date(),
): number | null {
  if (now >= reviewDeadline(order)) return null;
  const elapsedDays = (now.getTime() - (order.paidAt ?? order.createdAt).getTime()) / DAY_MS;
  const due = REVIEW_REMINDER_DAYS.filter((d) => d <= elapsedDays).at(-1);
  if (due === undefined) return null;
  return sentStages.some((s) => s >= due) ? null : due;
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

// ───────────────────────────── Admin filters ─────────────────────────────

export const REVIEW_VISIBILITIES = ["all", "visible", "hidden"] as const;
export type ReviewVisibility = (typeof REVIEW_VISIBILITIES)[number];

export type AdminReviewFilters = {
  /** Product name, reviewer name/email or review text. */
  q?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  visibility: ReviewVisibility;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Query string → filters. Anything unexpected falls back to "no filter". */
export function parseAdminReviewFilters(sp: SearchParams): AdminReviewFilters {
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const ratingNum = Number(one(sp.rating));
  const rating = [1, 2, 3, 4, 5].includes(ratingNum) ? (ratingNum as AdminReviewFilters["rating"]) : undefined;
  // Old links used ?filter=hidden; keep them working.
  const rawVisibility = one(sp.visibility) ?? (one(sp.filter) === "hidden" ? "hidden" : undefined);
  const visibility = REVIEW_VISIBILITIES.find((v) => v === rawVisibility) ?? "all";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  return { q, rating, visibility, page };
}

/** Filters → query params for links (defaults and page omitted). */
export function adminReviewFilterParams(f: AdminReviewFilters): Record<string, string | undefined> {
  return {
    q: f.q,
    rating: f.rating ? String(f.rating) : undefined,
    visibility: f.visibility === "all" ? undefined : f.visibility,
  };
}
