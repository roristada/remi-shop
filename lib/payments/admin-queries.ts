import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { PaymentStatus, Prisma } from "@/lib/generated/prisma/client";
import { BUCKETS } from "@/lib/storage/buckets";
import { createSignedViewUrls } from "@/lib/storage/payment-storage";

export const PAYMENT_TABS = {
  pending: { label: "รอตรวจ", statuses: ["WAITING", "REVIEWING"] },
  approved: { label: "อนุมัติแล้ว", statuses: ["APPROVED"] },
  rejected: { label: "ปฏิเสธแล้ว", statuses: ["REJECTED"] },
} as const satisfies Record<string, { label: string; statuses: PaymentStatus[] }>;

export type PaymentTab = keyof typeof PAYMENT_TABS;
export const PAYMENTS_PAGE_SIZE = 10;

export async function listPaymentsForReview(tab: PaymentTab, page: number) {
  const where: Prisma.PaymentWhereInput = { status: { in: [...PAYMENT_TABS[tab].statuses] } };
  const [total, rows, pendingCount] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      // Pending: oldest first (first come, first served). Reviewed: most recent first.
      orderBy: tab === "pending" ? { createdAt: "asc" } : { reviewedAt: "desc" },
      skip: (page - 1) * PAYMENTS_PAGE_SIZE,
      take: PAYMENTS_PAGE_SIZE,
      select: {
        id: true,
        amount: true,
        slipPath: true,
        status: true,
        rejectReason: true,
        createdAt: true,
        reviewedAt: true,
        reviewedBy: { select: { email: true, displayName: true } },
        order: {
          select: {
            orderNumber: true,
            total: true,
            createdAt: true,
            user: { select: { email: true, displayName: true } },
            items: {
              select: { id: true, productNameTHSnapshot: true, productVersionSnapshot: true, finalPrice: true },
            },
            _count: { select: { payments: true } },
          },
        },
      },
    }),
    prisma.payment.count({ where: { status: { in: [...PAYMENT_TABS.pending.statuses] } } }),
  ]);

  // Slips live in a private bucket: short-lived signed URLs, generated per page view.
  const urls = await createSignedViewUrls(
    BUCKETS.paymentSlips,
    rows.map((r) => r.slipPath),
  );
  const items = rows.map((r) => ({ ...r, slipUrl: urls.get(r.slipPath) ?? null }));

  return { items, total, pendingCount, pageCount: Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE)) };
}

export type ReviewPayment = Awaited<ReturnType<typeof listPaymentsForReview>>["items"][number];
