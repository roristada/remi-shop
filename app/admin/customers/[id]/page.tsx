import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getCustomer } from "@/lib/admin/customer-queries";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { ORDER_STATUS_LABEL_TH } from "@/lib/orders/export";
import { idSchema } from "@/lib/validation/product";
import type { LicenseRequestStatus } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_STYLES } from "@/components/cart/order-status-badge";
import { cn } from "@/lib/utils";

const LICENSE_STATUS: Record<LicenseRequestStatus, { label: string; className: string }> = {
  PENDING_REVIEW: { label: "รอพิจารณา", className: "bg-secondary text-secondary-foreground" },
  APPROVED: { label: "อนุมัติแล้ว", className: "bg-success/10 text-success" },
  REJECTED: { label: "ไม่อนุมัติ", className: "bg-destructive/10 text-destructive" },
  CANCELLED: { label: "ยกเลิก", className: "bg-muted text-muted-foreground" },
};

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
      <h2 className="font-semibold">
        {title}
        {count !== undefined && <span className="ml-1.5 text-sm font-normal text-muted-foreground">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>
);

export default async function AdminCustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const data = await getCustomer(id);
  if (!data) notFound();
  const { profile, stats, orders, owned, licenses, downloads } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden /> ลูกค้าทั้งหมด
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <span className="truncate">{profile.displayName ?? profile.email}</span>
            {profile.role === "ADMIN" && <Badge className="bg-secondary text-secondary-foreground">แอดมิน</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {profile.email} · สมัครเมื่อ {formatBangkokDateTime(profile.createdAt)}
          </p>
        </div>
        <dl className="flex gap-6 text-right">
          <div>
            <dt className="text-xs text-muted-foreground">คำสั่งซื้อสำเร็จ</dt>
            <dd className="text-xl font-semibold tabular-nums">{stats.paidOrders.toLocaleString("th-TH")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">ยอดซื้อรวม</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatTHB(stats.spent)}</dd>
          </div>
        </dl>
      </div>

      <Section title="คำสั่งซื้อ" count={orders.length}>
        {orders.length === 0 ? (
          <Empty>ยังไม่มีคำสั่งซื้อ</Empty>
        ) : (
          <>
            <ul className="divide-y">
              {orders.map((o) => {
                const first = o.licenseRequest
                  ? `${o.licenseRequest.productNameTHSnapshot} — License`
                  : o.items[0]
                    ? `${o.items[0].productNameTHSnapshot}${o.items[0].variantNameTHSnapshot ? ` (${o.items[0].variantNameTHSnapshot})` : ""}`
                    : "—";
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="w-44 shrink-0">
                      <p className="font-medium tabular-nums">{o.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatBangkokDateTime(o.createdAt)}</p>
                    </div>
                    <p className="min-w-0 flex-1 truncate">
                      {first}
                      {o.items.length > 1 && <span className="text-muted-foreground"> และอีก {o.items.length - 1} รายการ</span>}
                    </p>
                    <p className="w-24 text-right font-medium tabular-nums">{formatTHB(toHundredths(o.total))}</p>
                    <span className="flex w-28 justify-end">
                      <Badge className={cn("whitespace-nowrap", ORDER_STATUS_STYLES[o.status])}>{ORDER_STATUS_LABEL_TH[o.status]}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
            <Link
              href={`/admin/orders?q=${encodeURIComponent(profile.email)}`}
              className="inline-block text-sm font-medium text-brand-strong hover:underline"
            >
              ดูในหน้าคำสั่งซื้อ
            </Link>
          </>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="สินค้าที่ซื้อแล้ว" count={owned.length}>
          {owned.length === 0 ? (
            <Empty>ยังไม่มีสินค้าที่ซื้อสำเร็จ</Empty>
          ) : (
            <ul className="divide-y text-sm">
              {owned.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2">
                  <Link href={`/admin/products/${i.productId}`} className="min-w-0 truncate hover:underline">
                    {i.productNameTHSnapshot}
                    {i.variantNameTHSnapshot && <span className="text-muted-foreground"> ({i.variantNameTHSnapshot})</span>}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {i.order.paidAt ? formatBangkokDateTime(i.order.paidAt) : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="คำขอ License" count={licenses.length}>
          {licenses.length === 0 ? (
            <Empty>ยังไม่มีคำขอ</Empty>
          ) : (
            <ul className="divide-y text-sm">
              {licenses.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate">{l.productNameTHSnapshot}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBangkokDateTime(l.createdAt)} · {formatTHB(toHundredths(l.total))}
                    </p>
                  </div>
                  <Badge className={cn("shrink-0", LICENSE_STATUS[l.status].className)}>{LICENSE_STATUS[l.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="ดาวน์โหลดล่าสุด" count={downloads.length}>
        {downloads.length === 0 ? (
          <Empty>ยังไม่เคยดาวน์โหลด</Empty>
        ) : (
          <ul className="divide-y text-sm">
            {downloads.map((d) => (
              <li key={d.id} className="flex justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  {d.product.nameTH}
                  {d.file && <span className="text-muted-foreground"> · {d.file.fileName}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBangkokDateTime(d.downloadedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
