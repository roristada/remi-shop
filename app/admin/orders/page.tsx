import Link from "next/link";
import { Download, Mail, Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { listAdminOrders, orderLines, ORDER_EXPORT_LIMIT, type AdminOrderListRow } from "@/lib/orders/admin-queries";
import { adminOrderParams, ORDER_STATUSES, ORDER_STATUS_LABEL_TH, parseAdminOrderFilters } from "@/lib/orders/export";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewImageSrc } from "@/lib/storage/public-url";
import { Pagination } from "@/components/shared/pagination";
import { SelectInput } from "@/components/admin/form-controls";
import { ORDER_STATUS_STYLES } from "@/components/cart/order-status-badge";
import { cn } from "@/lib/utils";
import { lineHasFiles } from "@/lib/downloads/rules";
import { OrderSummaryRow, OrderSummaryTrigger, type OrderSummary } from "@/components/admin/order-summary-dialog";

/** Product lines with no file yet: the store sends those by email. */
function emailLineIds(o: AdminOrderListRow): Set<string> {
  return new Set(o.items.filter((i) => !lineHasFiles(i.product.versions[0]?.files ?? [], i.variantId)).map((i) => i.id));
}

function money(v: AdminOrderListRow["total"]): string {
  return formatTHB(toHundredths(v));
}

/** Everything the summary popup shows, formatted here so the client gets plain strings. */
function toSummary(o: AdminOrderListRow): OrderSummary {
  const license = o.licenseRequest;
  const licenseImage = license?.product.images[0];
  const discount = toHundredths(o.discount);
  const emailed = emailLineIds(o);
  return {
    orderId: o.id,
    orderNumber: o.orderNumber,
    createdAt: formatBangkokDateTime(o.createdAt),
    paidAt: o.paidAt ? formatBangkokDateTime(o.paidAt) : null,
    statusLabel: ORDER_STATUS_LABEL_TH[o.status],
    statusClassName: ORDER_STATUS_STYLES[o.status],
    isLicense: o.kind === "LICENSE",
    buyerName: o.user.displayName ?? "—",
    buyerEmail: o.user.email,
    lines: license
      ? license.items.map((i) => ({
          id: i.id,
          name: license.productNameTHSnapshot,
          detail: `License: ${i.nameTHSnapshot}`,
          emailDelivery: false,
          price: money(i.price),
          originalPrice: null,
          imageSrc: licenseImage ? previewImageSrc(licenseImage, "card") : null,
        }))
      : o.items.map((i) => {
          const image = i.product.images[0];
          return {
            id: i.id,
            name: i.productNameTHSnapshot,
            detail: i.variantNameTHSnapshot,
            emailDelivery: emailed.has(i.id),
            price: money(i.finalPrice),
            originalPrice: toHundredths(i.discount) > 0 ? money(i.unitPrice) : null,
            imageSrc: image ? previewImageSrc(image, "card") : null,
          };
        }),
    subtotal: money(o.subtotal),
    discount: discount > 0 ? money(o.discount) : null,
    total: money(o.total),
    note: o.adminNote?.body ?? null,
    filesEmail:
      o.kind === "PRODUCT" && o.status === "COMPLETED" && emailed.size > 0
        ? { sentAt: o.filesEmailedAt ? formatBangkokDateTime(o.filesEmailedAt) : null }
        : undefined,
  };
}

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = parseAdminOrderFilters(sp);
  const params = adminOrderParams(sp);
  const { rows, total, pageCount } = await listAdminOrders(filters);
  const exportQuery = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  const filtered = Boolean(filters.status || filters.q || filters.from || filters.to || filters.delivery);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl">คำสั่งซื้อ</h1>
          <p className="text-sm text-muted-foreground">
            {filtered ? "ตรงเงื่อนไข" : "ทั้งหมด"} {total.toLocaleString("th-TH")} รายการ
          </p>
        </div>
        {/* A plain link: the route re-checks admin rights and applies the same filters. */}
        <Button asChild variant="outline" className="h-10 rounded-full px-5">
          <a href={`/admin/orders/export${exportQuery ? `?${exportQuery}` : ""}`}>
            <Download aria-hidden /> ดาวน์โหลด CSV
          </a>
        </Button>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3 shadow-soft" role="search">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">ค้นหา</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={params.q} placeholder="เลขที่คำสั่งซื้อ อีเมล หรือชื่อสินค้า" className="h-10 rounded-xl pl-9" />
        </label>
        {/* "all" is a sentinel: it fails validation, i.e. "no filter". */}
        <SelectInput
          label="สถานะ"
          hideLabel
          name="status"
          defaultValue={filters.status ?? "all"}
          options={[{ value: "all", label: "ทุกสถานะ" }, ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL_TH[s] }))]}
          wrapperClassName="w-40 space-y-0"
        />
        <SelectInput
          label="การส่งไฟล์"
          hideLabel
          name="delivery"
          defaultValue={filters.delivery ?? "all"}
          options={[
            { value: "all", label: "ทุกการส่งไฟล์" },
            { value: "email", label: "มีไฟล์ส่งทางอีเมล" },
            { value: "emailPending", label: "รอส่งไฟล์ทางอีเมล" },
            { value: "emailSent", label: "ส่งไฟล์ทางอีเมลแล้ว" },
          ]}
          wrapperClassName="w-48 space-y-0"
        />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          ตั้งแต่วันที่
          <Input type="date" name="from" defaultValue={params.from} className="h-10 w-40 rounded-xl" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          ถึงวันที่
          <Input type="date" name="to" defaultValue={params.to} className="h-10 w-40 rounded-xl" />
        </label>
        <Button type="submit" variant="secondary" className="h-10 rounded-xl px-4">
          กรอง
        </Button>
        {filtered && (
          <Button asChild variant="ghost" className="h-10 rounded-xl px-3">
            <Link href="/admin/orders">ล้าง</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <p className="font-medium">ไม่พบคำสั่งซื้อ</p>
          {filtered && <p className="mt-1 text-sm text-muted-foreground">ลองเปลี่ยนตัวกรอง</p>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground">
                <TableHead className="w-48 pl-4">คำสั่งซื้อ</TableHead>
                <TableHead className="w-56">ผู้ซื้อ</TableHead>
                <TableHead className="hidden md:table-cell">สินค้า</TableHead>
                <TableHead className="w-28 pr-6 text-right">ยอดรวม</TableHead>
                <TableHead className="w-32 pr-4">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const lines = orderLines(o);
                const emailCount = emailLineIds(o).size;
                return (
                  <OrderSummaryRow key={o.id} summary={toSummary(o)}>
                    <TableCell className="pl-4 whitespace-nowrap">
                      <OrderSummaryTrigger>{o.orderNumber}</OrderSummaryTrigger>
                      <p className="text-xs text-muted-foreground">{formatBangkokDateTime(o.createdAt)}</p>
                      {/* Shown on every screen size: the products column is hidden on phones. */}
                      {emailCount > 0 && (
                        <Badge
                          className={cn(
                            "mt-1",
                            // Delivery status, separate from payment: only paid orders still owe the email.
                            o.status === "COMPLETED"
                              ? o.filesEmailedAt
                                ? "bg-success/10 text-success"
                                : "bg-warning/15 text-warning"
                              : "bg-secondary text-secondary-foreground",
                          )}
                        >
                          <Mail aria-hidden />
                          {o.status === "COMPLETED"
                            ? o.filesEmailedAt
                              ? "ส่งไฟล์ทางอีเมลแล้ว"
                              : "รอส่งไฟล์ทางอีเมล"
                            : `ส่งทางอีเมล ${emailCount === lines.length ? "ทั้งหมด" : `${emailCount} รายการ`}`}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56">
                      <p className="truncate">{o.user.displayName ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{o.user.email}</p>
                    </TableCell>
                    <TableCell className="hidden max-w-0 md:table-cell">
                      <p className="flex items-center gap-1.5">
                        {o.kind === "LICENSE" && (
                          <Badge className="shrink-0 bg-secondary text-secondary-foreground">License</Badge>
                        )}
                        <span className="truncate" title={lines[0]?.name}>
                          {lines[0]?.name ?? "—"}
                        </span>
                      </p>
                      {lines.length > 1 && (
                        <p className="text-xs text-muted-foreground">และอีก {lines.length - 1} รายการ · คลิกเพื่อดูทั้งหมด</p>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-medium whitespace-nowrap tabular-nums">
                      {money(o.total)}
                    </TableCell>
                    <TableCell className="pr-4">
                      <Badge className={cn("whitespace-nowrap", ORDER_STATUS_STYLES[o.status])}>{ORDER_STATUS_LABEL_TH[o.status]}</Badge>
                    </TableCell>
                  </OrderSummaryRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Pagination page={filters.page} pageCount={pageCount} params={params} basePath="/admin/orders" />
      <p className="text-xs text-muted-foreground">
        CSV มี 1 แถวต่อสินค้า ตามตัวกรองที่เลือก (สูงสุด {ORDER_EXPORT_LIMIT.toLocaleString("th-TH")} คำสั่งซื้อล่าสุด)
      </p>
    </div>
  );
}
