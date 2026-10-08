import "server-only";
import { prisma } from "@/lib/prisma/client";

/**
 * Creates the in-site "now on sale" notifications that are due for one customer: waitlisted
 * products whose sale has started (published, in an active category, sale not ended). Run lazily
 * with the header badges, like review reminders, so no scheduler is needed. Each entry is claimed
 * by setting notifiedAt in the same transaction, so it is announced at most once.
 */
export async function syncWaitlistNotifications(userId: string, now: Date = new Date()): Promise<void> {
  const due = await prisma.waitlistEntry.findMany({
    where: {
      userId,
      notifiedAt: null,
      product: {
        publishStatus: "PUBLISHED",
        category: { status: "ACTIVE" },
        saleStartAt: { lte: now },
        OR: [{ saleEndAt: null }, { saleEndAt: { gt: now } }],
      },
    },
    select: { productId: true, product: { select: { slug: true, nameTH: true, nameEN: true } } },
  });

  for (const entry of due) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.waitlistEntry.updateMany({
        where: { userId, productId: entry.productId, notifiedAt: null },
        data: { notifiedAt: now },
      });
      if (claimed.count !== 1) return;
      await tx.notification.create({
        data: {
          userId,
          type: "PRODUCT_AVAILABLE",
          params: {
            productId: entry.productId,
            productSlug: entry.product.slug,
            productNameTH: entry.product.nameTH,
            productNameEN: entry.product.nameEN,
          },
        },
      });
    });
  }
}
