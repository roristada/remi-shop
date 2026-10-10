import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, ImageOff } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { idSchema } from "@/lib/validation/product";
import { getLicenseRequestForReview } from "@/lib/licenses/admin-queries";
import { listActiveFormFields } from "@/lib/licenses/form-queries";
import { ARTWORK_FIELD_ID } from "@/lib/licenses/form-fields";
import { buildHistory } from "@/lib/licenses/history";
import { approveLicenseRequest, rejectLicenseRequest } from "@/lib/licenses/admin-actions";
import { ReviewActions } from "@/components/admin/review-actions";
import { LicenseSendBackDialog } from "@/components/admin/license-send-back-dialog";
import { LicenseHistory } from "@/components/shared/license-history";
import { LICENSE_REJECT_REASONS, LICENSE_STATUS_TH, ORDER_STATUS_TH } from "@/lib/licenses/admin-labels";
import { cn } from "@/lib/utils";

const EVENT_TH = {
  SUBMITTED: "ลูกค้าส่งคำขอ",
  CUSTOMER_EDITED: "ลูกค้าแก้ไขข้อมูล",
  CHANGES_REQUESTED: "ส่งกลับให้ลูกค้า (แก้ราคา / ขอข้อมูลเพิ่ม)",
  CUSTOMER_RESPONDED: "ลูกค้าส่งข้อมูลกลับ",
  PRICE_ACCEPTED: "ลูกค้ายอมรับราคาใหม่",
  APPROVED: "อนุมัติ",
  REJECTED: "ปฏิเสธ",
  CANCELLED: "ลูกค้ายกเลิก",
} as const;

export default async function AdminLicenseRequestPage({ params }: PageProps<"/admin/licenses/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const [r, fields] = await Promise.all([getLicenseRequestForReview(id), listActiveFormFields()]);
  if (!r) notFound();

  const money = (v: { toString(): string }) => formatTHB(toHundredths(v));
  const account = r.user.displayName ? `${r.user.displayName} (${r.user.email})` : r.user.email;
  const labelById = new Map<string, string>([[ARTWORK_FIELD_ID, "รูปผลงาน"]]);
  for (const a of r.answers) if (a.fieldId) labelById.set(a.fieldId, a.labelTHSnapshot);
  for (const f of fields) labelById.set(f.id, f.labelTH);
  const flagged = new Set(r.infoRequestFields);
  const waitingCustomer = r.status === "NEEDS_INFO" || r.status === "AWAITING_PRICE_CONFIRMATION";

  const history = buildHistory(r.events, {
    title: (type) => EVENT_TH[type],
    date: (d) => formatBangkokDateTime(d),
    money,
    fieldLabel: (fid) => labelById.get(fid) ?? null,
    locale: "th",
    priceLine: (o, n) => `ราคา ${o} → ${n}`,
    changeLine: (label, before, after) => `${label}: ${before} → ${after}`,
    flaggedLine: (labels) => `ขอให้แก้: ${labels}`,
    empty: "(ว่าง)",
    showActor: true,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/licenses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> คำขอ License
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl">
            <Link href={`/admin/products/${r.product.id}`} className="hover:underline">
              {r.productNameTHSnapshot}
            </Link>
          </h1>
          <p className="text-sm text-muted-foreground">
            บัญชี{" "}
            <Link href={`/admin/customers/${r.user.id}`} className="underline-offset-4 hover:underline">
              {account}
            </Link>{" "}
            · ส่งคำขอเมื่อ {formatBangkokDateTime(r.createdAt)}
          </p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-medium", LICENSE_STATUS_TH[r.status].className)}>
          {LICENSE_STATUS_TH[r.status].label}
        </span>
      </div>

      {(r.status === "PENDING_REVIEW" || waitingCustomer) && (
        <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft md:p-5">
          {waitingCustomer && (
            <div className="space-y-1 rounded-xl bg-warning/10 p-3 text-sm">
              <p className="font-medium">
                {r.status === "NEEDS_INFO" ? "รอลูกค้าส่งข้อมูลเพิ่ม" : "รอลูกค้ายืนยันราคาใหม่"}
              </p>
              {r.proposedTotal && (
                <p>
                  ราคาที่เสนอ {money(r.total)} → <span className="font-semibold">{money(r.proposedTotal)}</span>
                  {r.priceChangeReason && ` · ${r.priceChangeReason}`}
                </p>
              )}
              {r.infoRequestMessage && <p className="whitespace-pre-line">ข้อความ: {r.infoRequestMessage}</p>}
              {flagged.size > 0 && <p>ขอให้แก้: {[...flagged].map((f) => labelById.get(f)).filter(Boolean).join(", ")}</p>}
            </div>
          )}
          <ReviewActions
            approve={r.status === "PENDING_REVIEW" ? approveLicenseRequest.bind(null, r.id) : undefined}
            reject={rejectLicenseRequest.bind(null, r.id)}
            approveTitle={`อนุมัติคำขอ ${r.productNameTHSnapshot}?`}
            approveDescription={<p>ระบบจะสร้างคำสั่งซื้อยอด {money(r.total)} ให้ลูกค้าชำระเงินผ่าน QR แล้วแนบสลิป สิทธิ์จะมีผลเมื่อยืนยันสลิปแล้ว</p>}
            rejectTitle={`ปฏิเสธคำขอ ${r.productNameTHSnapshot}`}
            rejectDescription="ลูกค้าจะเห็นเหตุผลนี้ และส่งคำขอใหม่ได้"
            rejectLabel="ปฏิเสธคำขอ"
            quickReasons={LICENSE_REJECT_REASONS}
            extra={
              r.status === "PENDING_REVIEW" ? (
                <LicenseSendBackDialog
                  requestId={r.id}
                  currentTotal={r.total.toString().replace(/\.00$/, "")}
                  currentTotalLabel={money(r.total)}
                  fields={[...fields.map((f) => ({ id: f.id, label: f.labelTH })), { id: ARTWORK_FIELD_ID, label: "รูปผลงาน" }]}
                />
              ) : undefined
            }
          />
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
        <div>
          {r.artworkUrl ? (
            <a href={r.artworkUrl} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL to a private object */}
              <img src={r.artworkUrl} alt="ผลงานที่แนบมากับคำขอ" className="max-h-96 w-full object-contain" />
              <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs">
                <ExternalLink className="size-3" aria-hidden /> เปิดรูปเต็ม
              </span>
            </a>
          ) : (
            <div className="grid aspect-[3/4] place-items-center rounded-xl bg-muted text-sm text-muted-foreground">
              <span className="flex flex-col items-center gap-2">
                <ImageOff className="size-5" aria-hidden /> {r.artworkPath ? "โหลดรูปผลงานไม่ได้" : "ลูกค้ายังไม่ได้แนบรูปผลงาน"}
              </span>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <section className="space-y-2">
            <h2 className="font-semibold">ประเภทการใช้งาน</h2>
            <ul className="divide-y rounded-xl border text-sm">
              {r.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">{i.nameTHSnapshot}</span>
                  <span className="shrink-0 tabular-nums">{money(i.price)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 px-3 py-2 font-semibold">
                <span>ราคารวม</span>
                <span className="tabular-nums">{money(r.total)}</span>
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">ข้อมูลที่ลูกค้าส่ง</h2>
            <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
              {r.answers.map((a) => (
                <div key={a.id} className="contents">
                  <dt className={cn("text-muted-foreground", a.fieldId && flagged.has(a.fieldId) && "font-medium text-warning")}>
                    {a.labelTHSnapshot}
                  </dt>
                  <dd className="break-words whitespace-pre-line">{a.values.join(", ")}</dd>
                </div>
              ))}
            </dl>
          </section>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {r.reviewedAt && (
              <>
                <dt className="text-muted-foreground">พิจารณาเมื่อ</dt>
                <dd>
                  {formatBangkokDateTime(r.reviewedAt)}
                  {r.reviewedBy ? ` โดย ${r.reviewedBy.displayName ?? r.reviewedBy.email}` : ""}
                </dd>
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
        </div>
      </div>

      <LicenseHistory title="ประวัติการดำเนินการ" entries={history} />
    </div>
  );
}
