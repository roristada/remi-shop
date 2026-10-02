import Link from "next/link";
import { ExternalLink, ImageOff } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { listPaymentsForReview, PAYMENT_TABS, type PaymentTab, type ReviewPayment } from "@/lib/payments/admin-queries";
import { Pagination } from "@/components/shared/pagination";
import { ReviewActions } from "@/components/admin/review-actions";
import { approvePayment, rejectPayment } from "@/lib/payments/admin-actions";
import { cn } from "@/lib/utils";
import { OrderNote } from "@/components/admin/order-note";
import type { SlipCheckResult } from "@/lib/generated/prisma/enums";

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export default async function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: PaymentTab = (Object.keys(PAYMENT_TABS) as PaymentTab[]).find((k) => k === one(sp.tab)) ?? "pending";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  const { items, total, pendingCount, pageCount } = await listPaymentsForReview(tab, page);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl">ตรวจสลิป</h1>
        <p className="text-sm text-muted-foreground">รอตรวจ {pendingCount.toLocaleString("th-TH")} รายการ</p>
      </div>

      <nav aria-label="สถานะสลิป" className="flex gap-1 rounded-full bg-card p-1 shadow-soft sm:w-fit">
        {(Object.entries(PAYMENT_TABS) as [PaymentTab, (typeof PAYMENT_TABS)[PaymentTab]][]).map(([key, t]) => (
          <Link
            key={key}
            href={key === "pending" ? "/admin/payments" : `/admin/payments?tab=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-center text-sm transition-colors sm:flex-none",
              key === tab ? "bg-primary font-medium" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
            {key === "pending" && pendingCount > 0 && <span className="ml-1.5 tabular-nums">({pendingCount})</span>}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <p className="font-medium">{tab === "pending" ? "ไม่มีสลิปรอตรวจ" : "ยังไม่มีรายการ"}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((p) => (
            <PaymentCard key={p.id} payment={p} tab={tab} />
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        params={{ tab: tab === "pending" ? undefined : tab }}
        basePath="/admin/payments"
      />
      <p className="text-xs text-muted-foreground">ทั้งหมด {total.toLocaleString("th-TH")} รายการในแท็บนี้</p>
    </div>
  );
}

const SLIP_REJECT_REASONS = [
  "ยอดเงินไม่ตรงกับยอดคำสั่งซื้อ",
  "สลิปไม่ชัดเจน อ่านข้อมูลไม่ได้",
  "ไม่พบรายการโอนเข้าบัญชี",
  "สลิปซ้ำกับคำสั่งซื้ออื่น",
] as const;

/** Why the automatic check did not approve the slip; shown to help the admin decide quickly. */
const AUTO_CHECK_LABELS: Record<Exclude<SlipCheckResult, "PASSED">, string> = {
  AMOUNT_MISMATCH: "ยอดในสลิปไม่ตรงกับยอดคำสั่งซื้อ",
  RECEIVER_MISMATCH: "บัญชีผู้รับไม่ใช่บัญชีร้าน",
  DUPLICATE: "สลิปนี้เคยถูกใช้แล้ว",
  BEFORE_ORDER: "โอนก่อนสร้างคำสั่งซื้อ",
  NOT_FOUND: "ไม่พบรายการโอนนี้ที่ธนาคาร",
  UNREADABLE: "อ่าน QR บนสลิปไม่ได้",
  UNAVAILABLE: "ตรวจอัตโนมัติไม่ได้ (ระบบธนาคารหรือ SlipOK ขัดข้อง)",
};

function PaymentCard({ payment: p, tab }: { payment: ReviewPayment; tab: PaymentTab }) {
  const amount = toHundredths(p.amount);
  const orderTotal = toHundredths(p.order.total);
  const customer = p.order.user.displayName ? `${p.order.user.displayName} (${p.order.user.email})` : p.order.user.email;

  return (
    <li className="grid gap-5 rounded-2xl border bg-card p-4 shadow-soft md:grid-cols-[16rem_1fr] md:p-5">
      {/* Signed, short-lived URL to a private object; not passed through the image optimizer. */}
      <div className="space-y-2">
        {p.slipUrl ? (
          <a href={p.slipUrl} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.slipUrl} alt={`สลิปของคำสั่งซื้อ ${p.order.orderNumber}`} className="max-h-96 w-full object-contain" />
            <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <ExternalLink className="size-3" aria-hidden /> เปิดรูปเต็ม
            </span>
          </a>
        ) : (
          <div className="grid aspect-[3/4] place-items-center rounded-xl bg-muted text-sm text-muted-foreground">
            <span className="flex flex-col items-center gap-2">
              <ImageOff className="size-5" aria-hidden /> โหลดสลิปไม่ได้
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tabular-nums">{p.order.orderNumber}</p>
            <p className="text-sm text-muted-foreground">{customer}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">{formatTHB(orderTotal)}</p>
            {amount !== orderTotal && <p className="text-xs text-destructive">ยอดในบันทึกชำระ {formatTHB(amount)}</p>}
          </div>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">ส่งสลิปเมื่อ</dt>
          <dd>{formatBangkokDateTime(p.createdAt)}</dd>
          <dt className="text-muted-foreground">สั่งซื้อเมื่อ</dt>
          <dd>{formatBangkokDateTime(p.order.createdAt)}</dd>
          {p.order._count.payments > 1 && (
            <>
              <dt className="text-muted-foreground">จำนวนครั้งที่ส่งสลิป</dt>
              <dd>{p.order._count.payments} ครั้ง</dd>
            </>
          )}
          {p.autoCheckResult && (
            <>
              <dt className="text-muted-foreground">ตรวจอัตโนมัติ</dt>
              <dd className={p.autoCheckResult === "PASSED" ? undefined : "font-medium text-destructive"}>
                {p.autoCheckResult === "PASSED" ? "ผ่าน" : `ไม่ผ่าน: ${AUTO_CHECK_LABELS[p.autoCheckResult]}`}
              </dd>
            </>
          )}
          {p.reviewedAt && (
            <>
              <dt className="text-muted-foreground">ตรวจเมื่อ</dt>
              <dd>
                {formatBangkokDateTime(p.reviewedAt)}
                {p.reviewedBy
                  ? ` โดย ${p.reviewedBy.displayName ?? p.reviewedBy.email}`
                  : p.autoCheckResult === "PASSED"
                    ? " (อนุมัติอัตโนมัติ)"
                    : ""}
              </dd>
            </>
          )}
          {p.rejectReason && (
            <>
              <dt className="text-muted-foreground">เหตุผลที่ปฏิเสธ</dt>
              <dd className="text-destructive">{p.rejectReason}</dd>
            </>
          )}
        </dl>

        <OrderNote orderId={p.order.id} note={p.order.adminNote?.body ?? null} className="max-w-md" />

        {p.order.licenseRequest ? (
          <div className="space-y-1.5">
            <p className="text-sm">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">Commercial license</span>{" "}
              {p.order.licenseRequest.productNameTHSnapshot}
              <span className="text-muted-foreground"> · ศิลปิน {p.order.licenseRequest.artistName}</span>
            </p>
            <ul className="divide-y rounded-xl border text-sm">
              {p.order.licenseRequest.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate">{i.nameTHSnapshot}</span>
                  <span className="shrink-0 tabular-nums">{formatTHB(toHundredths(i.price))}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {p.order.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">
                  {i.productNameTHSnapshot}
                  {i.variantNameTHSnapshot && <span> ({i.variantNameTHSnapshot})</span>}
                  {i.productVersionSnapshot && <span className="text-muted-foreground"> v{i.productVersionSnapshot}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{formatTHB(toHundredths(i.finalPrice))}</span>
              </li>
            ))}
          </ul>
        )}

        {tab === "pending" && (
          <div className="mt-auto">
            <ReviewActions
              approve={approvePayment.bind(null, p.id)}
              reject={rejectPayment.bind(null, p.id)}
              approveTitle={`อนุมัติคำสั่งซื้อ ${p.order.orderNumber}?`}
              approveDescription={
                <p>
                  ยืนยันว่าได้รับเงิน {formatTHB(orderTotal)} แล้ว{" "}
                  {p.order.kind === "LICENSE"
                    ? "สิทธิ์เชิงพาณิชย์จะมีผลทันทีหลังอนุมัติ"
                    : "ลูกค้าจะดาวน์โหลดไฟล์ได้ทันทีหลังอนุมัติ"}
                </p>
              }
              rejectTitle={`ปฏิเสธสลิป ${p.order.orderNumber}`}
              rejectDescription="ลูกค้าจะเห็นเหตุผลนี้และแนบสลิปใหม่ได้"
              rejectLabel="ปฏิเสธสลิป"
              quickReasons={SLIP_REJECT_REASONS}
            />
          </div>
        )}
      </div>
    </li>
  );
}
