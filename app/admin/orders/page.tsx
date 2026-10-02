import Link from "next/link";
import { Download, Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { listAdminOrders, orderLines, ORDER_EXPORT_LIMIT } from "@/lib/orders/admin-queries";
import { adminOrderParams, ORDER_STATUSES, ORDER_STATUS_LABEL_TH, parseAdminOrderFilters } from "@/lib/orders/export";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { SelectInput } from "@/components/admin/form-controls";
import { ORDER_STATUS_STYLES } from "@/components/cart/order-status-badge";
import { cn } from "@/lib/utils";
import { OrderNote } from "@/components/admin/order-note";

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = parseAdminOrderFilters(sp);
  const params = adminOrderParams(sp);
  const { rows, total, pageCount } = await listAdminOrders(filters);
  const exportQuery = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  const filtered = Boolean(filters.status || filters.q || filters.from || filters.to);

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
          <Input name="q" defaultValue={params.q} placeholder="เลขที่คำสั่งซื้อหรืออีเมล" className="h-10 rounded-xl pl-9" />
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
                <TableHead className="w-32">สถานะ</TableHead>
                <TableHead className="w-56 pr-4">หมายเหตุภายใน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const lines = orderLines(o);
                return (
                  <TableRow key={o.id} className="hover:bg-muted/40">
                    <TableCell className="pl-4 whitespace-nowrap">
                      <p className="font-medium tabular-nums">{o.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatBangkokDateTime(o.createdAt)}</p>
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
                      {lines.length > 1 && <p className="text-xs text-muted-foreground">และอีก {lines.length - 1} รายการ</p>}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-medium whitespace-nowrap tabular-nums">
                      {formatTHB(toHundredths(o.total))}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("whitespace-nowrap", ORDER_STATUS_STYLES[o.status])}>{ORDER_STATUS_LABEL_TH[o.status]}</Badge>
                    </TableCell>
                    <TableCell className="w-56 max-w-56 pr-4 align-top">
                      <OrderNote orderId={o.id} note={o.adminNote?.body ?? null} />
                    </TableCell>
                  </TableRow>
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
