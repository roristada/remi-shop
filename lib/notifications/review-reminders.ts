import "server-only";
import { prisma } from "@/lib/prisma/client";
import { dueReviewReminder, REVIEW_WINDOW_MS } from "@/lib/reviews/rules";
import { parseNotificationParams } from "@/lib/notifications/rules";

/**
 * Creates the in-site "please review" reminders that are due for one customer (7, 15 and 28 days
 * after approval, only for purchases not reviewed yet). Run lazily when the customer's
 * notification count is read, so no scheduler is needed; each stage is sent at most once.
 */
export async function syncReviewReminders(userId: string, now: Date = new Date()): Promise<void> {
  const since = new Date(now.getTime() - REVIEW_WINDOW_MS);
  const items = await prisma.orderItem.findMany({
    where: { order: { userId, kind: "PRODUCT", status: "COMPLETED", paidAt: { gte: since } } },
    orderBy: { order: { paidAt: "asc" } },
    select: {
      productId: true,
      productNameTHSnapshot: true,
      productNameENSnapshot: true,
      order: { select: { orderNumber: true, paidAt: true, createdAt: true } },
    },
  });
  if (items.length === 0) return;

  const productIds = [...new Set(items.map((i) => i.productId))];
  const [reviews, sent] = await Promise.all([
    prisma.review.findMany({ where: { userId, productId: { in: productIds } }, select: { productId: true } }),
    prisma.notification.findMany({
      where: { userId, type: "REVIEW_REMINDER", createdAt: { gte: since } },
      select: { params: true },
    }),
  ]);
  const reviewed = new Set(reviews.map((r) => r.productId));
  const sentStages = new Map<string, number[]>();
  for (const row of sent) {
    const { productId, stage } = parseNotificationParams(row.params);
    if (productId && stage) sentStages.set(productId, [...(sentStages.get(productId) ?? []), Number(stage)]);
  }

  const seen = new Set<string>();
  const due = [];
  // One reminder per product, from its earliest qualifying order.
  for (const item of items) {
    if (reviewed.has(item.productId) || seen.has(item.productId)) continue;
    seen.add(item.productId);
    const stage = dueReviewReminder(item.order, sentStages.get(item.productId) ?? [], now);
    if (stage === null) continue;
    due.push({
      userId,
      type: "REVIEW_REMINDER" as const,
      params: {
        productId: item.productId,
        stage: String(stage),
        productNameTH: item.productNameTHSnapshot,
        productNameEN: item.productNameENSnapshot,
        orderNumber: item.order.orderNumber,
      },
    });
  }
  if (due.length > 0) await prisma.notification.createMany({ data: due });
}
