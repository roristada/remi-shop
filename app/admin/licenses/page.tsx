import Link from "next/link";
import { ChevronRight, ExternalLink, FormInput, ImageOff, ListChecks } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import {
  LICENSE_TABS,
  listLicenseRequestsForReview,
  type LicenseTab,
  type ReviewLicenseRequest,
} from "@/lib/licenses/admin-queries";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import { ReviewActions } from "@/components/admin/review-actions";
import { approveLicenseRequest, rejectLicenseRequest } from "@/lib/licenses/admin-actions";
import { LICENSE_REJECT_REASONS, LICENSE_STATUS_TH, ORDER_STATUS_TH } from "@/lib/licenses/admin-labels";
import { listActiveFormFields } from "@/lib/licenses/form-queries";
import { ARTWORK_FIELD_ID } from "@/lib/licenses/form-fields";
import { LicenseSendBackDialog } from "@/components/admin/license-send-back-dialog";
import { cn } from "@/lib/utils";

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export default async function AdminLicensesPage({ searchParams }: PageProps<"/admin/licenses">) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: LicenseTab = (Object.keys(LICENSE_TABS) as LicenseTab[]).find((k) => k === one(sp.tab)) ?? "pending";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page) ?? "1", 10) || 1));
  const [{ items, total, pendingCount, pageCount }, fields] = await Promise.all([
    listLicenseRequestsForReview(tab, page),
    listActiveFormFields(),
  ]);
  const flaggable = [...fields.map((f) => ({ id: f.id, label: f.labelTH })), { id: ARTWORK_FIELD_ID, label: "รูปผลงาน" }];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">คำขอ Commercial license</h1>
          <p className="text-sm text-muted-foreground">รอพิจารณา {pendingCount.toLocaleString("th-TH")} รายการ</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10 rounded-full px-5">
            <Link href="/admin/licenses/form">
              <FormInput aria-hidden /> แบบฟอร์มคำขอ
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-10 rounded-full px-5">
            <Link href="/admin/licenses/types">
              <ListChecks aria-hidden /> ประเภทการใช้งาน
            </Link>
          </Button>
        </div>
      </div>

      <nav aria-label="สถานะคำขอ" className="flex gap-1 rounded-full bg-card p-1 shadow-soft sm:w-fit">
        {(Object.entries(LICENSE_TABS) as [LicenseTab, (typeof LICENSE_TABS)[LicenseTab]][]).map(([key, t]) => (
          <Link
            key={key}
            href={key === "pending" ? "/admin/licenses" : `/admin/licenses?tab=${key}`}
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
          <p className="font-medium">{tab === "pending" ? "ไม่มีคำขอรอพิจารณา" : "ยังไม่มีรายการ"}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((r) => (
            <LicenseCard key={r.id} request={r} flaggable={flaggable} />
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        params={{ tab: tab === "pending" ? undefined : tab }}
        basePath="/admin/licenses"
      />
      <p className="text-xs text-muted-foreground">ทั้งหมด {total.toLocaleString("th-TH")} รายการในแท็บนี้</p>
    </div>
  );
}

function LicenseCard({ request: r, flaggable }: { request: ReviewLicenseRequest; flaggable: { id: string; label: string }[] }) {
  const account = r.user.displayName ? `${r.user.displayName} (${r.user.email})` : r.user.email;
  const total = formatTHB(toHundredths(r.total));

  return (
    <li className="grid gap-5 rounded-2xl border bg-card p-4 shadow-soft md:grid-cols-[16rem_1fr] md:p-5">
      {/* Signed, short-lived URL to a private object; not passed through the image optimizer. */}
      <div>
        {r.artworkUrl ? (
          <a
            href={r.artworkUrl}
            target="_blank"
            rel="noreferrer"
            className="group relative block overflow-hidden rounded-xl border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.artworkUrl} alt={`ผลงานที่แนบมากับคำขอของ ${r.artistName}`} className="max-h-96 w-full object-contain" />
            <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <ExternalLink className="size-3" aria-hidden /> เปิดรูปเต็ม
            </span>
          </a>
        ) : (
          <div className="grid aspect-[3/4] place-items-center rounded-xl bg-muted text-sm text-muted-foreground">
            <span className="flex flex-col items-center gap-2">
              <ImageOff className="size-5" aria-hidden /> {r.hasArtwork ? "โหลดรูปผลงานไม่ได้" : "ลูกค้ายังไม่ได้แนบรูปผลงาน"}
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/admin/products/${r.product.id}`} className="text-lg font-semibold hover:underline">
              {r.productNameTHSnapshot}
            </Link>
            <p className="text-sm text-muted-foreground">บัญชี {account}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">{total}</p>
            {r.proposedTotal && (
              <p className="text-sm text-warning tabular-nums">เสนอใหม่ {formatTHB(toHundredths(r.proposedTotal))}</p>
            )}
            <span className={cn("mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", LICENSE_STATUS_TH[r.status].className)}>
              {LICENSE_STATUS_TH[r.status].label}
            </span>
          </div>
        </div>

        <ul className="divide-y rounded-xl border text-sm">
          {r.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 px-3 py-2">
              <span className="min-w-0">{i.nameTHSnapshot}</span>
              <span className="shrink-0 tabular-nums">{formatTHB(toHundredths(i.price))}</span>
            </li>
          ))}
        </ul>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {r.answers.map((ans) => (
            <div key={ans.id} className="contents">
              <dt className="text-muted-foreground">{ans.labelTHSnapshot}</dt>
              <dd className="break-words whitespace-pre-line">{ans.values.join(", ")}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">ส่งคำขอเมื่อ</dt>
          <dd>{formatBangkokDateTime(r.createdAt)}</dd>
          {r.reviewedAt && (
            <>
              <dt className="text-muted-foreground">พิจารณาเมื่อ</dt>
              <dd>
                {formatBangkokDateTime(r.reviewedAt)}
                {r.reviewedBy ? ` โดย ${r.reviewedBy.displayName ?? r.reviewedBy.email}` : ""}
              </dd>
            </>
          )}
          {r.status === "CANCELLED" && r.cancelledAt && (
            <>
              <dt className="text-muted-foreground">ลูกค้ายกเลิกเมื่อ</dt>
              <dd>{formatBangkokDateTime(r.cancelledAt)}</dd>
            </>
          )}
          {r.rejectReason && (
            <>
              <dt className="text-muted-foreground">เหตุผลที่ปฏิเสธ</dt>
              <dd className="text-destructive">{r.rejectReason}</dd>
            </>
          )}
          {r.order && (
            <>
              <dt className="text-muted-foreground">คำสั่งซื้อ</dt>
              <dd>
                <span className="tabular-nums">{r.order.orderNumber}</span> · {ORDER_STATUS_TH[r.order.status]}
                {r.order.status === "PENDING_PAYMENT" && ` (ชำระภายใน ${formatBangkokDateTime(r.order.expiresAt)})`}
              </dd>
            </>
          )}
        </dl>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          {r.status === "PENDING_REVIEW" && (
            <ReviewActions
              approve={approveLicenseRequest.bind(null, r.id)}
              reject={rejectLicenseRequest.bind(null, r.id)}
              approveTitle={`อนุมัติ License ของ ${r.artistName}?`}
              approveDescription={
                <p>ระบบจะสร้างคำสั่งซื้อยอด {total} ให้ลูกค้าชำระเงินผ่าน QR แล้วแนบสลิป สิทธิ์จะมีผลเมื่อยืนยันสลิปแล้ว</p>
              }
              rejectTitle={`ปฏิเสธคำขอ ${r.productNameTHSnapshot}`}
              rejectDescription="ลูกค้าจะเห็นเหตุผลนี้ และส่งคำขอใหม่ได้"
              rejectLabel="ปฏิเสธคำขอ"
              quickReasons={LICENSE_REJECT_REASONS}
              extra={
                <LicenseSendBackDialog
                  requestId={r.id}
                  currentTotal={r.total.toString().replace(/\.00$/, "")}
                  currentTotalLabel={total}
                  fields={flaggable}
                />
              }
            />
          )}
          <Button asChild variant="ghost" className="h-10 rounded-full px-4">
            <Link href={`/admin/licenses/${r.id}`}>
              รายละเอียดและประวัติ <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </li>
  );
}
