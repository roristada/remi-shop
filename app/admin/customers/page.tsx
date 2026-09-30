import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listCustomers, parseCustomerFilters } from "@/lib/admin/customer-queries";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB } from "@/lib/pricing/calculate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/shared/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireAdmin();
  const filters = parseCustomerFilters(await searchParams);
  const { rows, total, pageCount } = await listCustomers(filters);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ลูกค้า</h1>
        <p className="text-sm text-muted-foreground">
          {filters.q ? "ตรงกับการค้นหา" : "บัญชีทั้งหมด"} {total.toLocaleString("th-TH")} บัญชี · ยอดซื้อนับเฉพาะคำสั่งซื้อที่สำเร็จ
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3 shadow-soft" role="search">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">ค้นหา</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filters.q} placeholder="ชื่อหรืออีเมล" className="h-10 rounded-xl pl-9" />
        </label>
        <Button type="submit" variant="secondary" className="h-10 rounded-xl px-4">
          ค้นหา
        </Button>
        {filters.q && (
          <Button asChild variant="ghost" className="h-10 rounded-xl px-3">
            <Link href="/admin/customers">ล้าง</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <p className="font-medium">{filters.q ? "ไม่พบลูกค้าที่ตรงกับการค้นหา" : "ยังไม่มีลูกค้า"}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground">
                <TableHead className="pl-4">ลูกค้า</TableHead>
                <TableHead className="hidden w-40 md:table-cell">สมัครเมื่อ</TableHead>
                <TableHead className="w-28 text-right">คำสั่งซื้อสำเร็จ</TableHead>
                <TableHead className="w-32 pr-6 text-right">ยอดซื้อรวม</TableHead>
                <TableHead className="hidden w-40 pr-4 lg:table-cell">สั่งซื้อล่าสุด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/40">
                  <TableCell className="max-w-0 pl-4">
                    <Link href={`/admin/customers/${c.id}`} className="flex items-center gap-2 font-medium hover:underline">
                      <span className="truncate">{c.displayName ?? c.email}</span>
                      {c.role === "ADMIN" && <Badge className="shrink-0 bg-secondary text-secondary-foreground">แอดมิน</Badge>}
                    </Link>
                    {c.displayName && <p className="truncate text-xs text-muted-foreground">{c.email}</p>}
                  </TableCell>
                  <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                    {formatBangkokDateTime(c.createdAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.paidOrders.toLocaleString("th-TH")}</TableCell>
                  <TableCell className="pr-6 text-right font-medium whitespace-nowrap tabular-nums">{formatTHB(c.spent)}</TableCell>
                  <TableCell className="hidden pr-4 text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
                    {c.lastOrderAt ? formatBangkokDateTime(c.lastOrderAt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={filters.page} pageCount={pageCount} params={{ q: filters.q }} basePath="/admin/customers" />
    </div>
  );
}
