import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { bangkokDayKey, startOfBangkokMonth } from "@/lib/admin/dashboard";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { parseAdminOrderFilters } from "@/lib/orders/export";
import { getCostSettings, listProductsWithoutCost } from "@/lib/costs/service";
import { getProfitReport } from "@/lib/costs/report";
import { marginBp, type ProfitTotals } from "@/lib/costs/profit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/shared/pagination";
import { CostSheetPanel } from "@/components/admin/cost-sheet-panel";
import { cn } from "@/lib/utils";

const PENDING = "รอระบุต้นทุน";

function money(satang: number) {
  return formatTHB(satang);
}

function pct(t: ProfitTotals) {
  const bp = marginBp(t);
  return bp === null ? "—" : `${(bp / 100).toFixed(1)}%`;
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "positive" | "warning" }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "positive" && "text-success", tone === "warning" && "text-warning")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function AdminProfitPage({ searchParams }: PageProps<"/admin/profit">) {
  await requireAdmin();
  const sp = await searchParams;
  const now = new Date();
  const parsed = parseAdminOrderFilters(sp);
  // Default: this month so far (Bangkok).
  const from = parsed.from ?? startOfBangkokMonth(now);
  const to = parsed.to ?? now;
  const fromKey = typeof sp.from === "string" && sp.from ? sp.from : bangkokDayKey(from);
  const toKey = typeof sp.to === "string" && sp.to ? sp.to : bangkokDayKey(to);

  const [settings, report, missing] = await Promise.all([
    getCostSettings(),
    getProfitReport(from, to, parsed.page),
    listProductsWithoutCost(),
  ]);
  const t = report.totals;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl">ต้นทุนและกำไร</h1>
        <p className="text-sm text-muted-foreground">คำสั่งซื้อสินค้าที่ชำระเงินสำเร็จ นับตามวันที่ชำระ · เห็นเฉพาะแอดมิน</p>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3 shadow-soft">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          ตั้งแต่วันที่
          <Input type="date" name="from" defaultValue={fromKey} className="h-10 w-40 rounded-xl" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          ถึงวันที่
          <Input type="date" name="to" defaultValue={toKey} className="h-10 w-40 rounded-xl" />
        </label>
        <Button type="submit" variant="secondary" className="h-10 rounded-xl px-4">
          ดูข้อมูล
        </Button>
        <Button asChild variant="ghost" className="h-10 rounded-xl px-3">
          <Link href="/admin/profit">เดือนนี้</Link>
        </Button>
      </form>

      {report.truncated && (
        <p role="status" className="rounded-xl bg-warning/10 px-4 py-2 text-sm text-warning">ข้อมูลเยอะเกินไป แสดงเฉพาะบางส่วน กรุณาเลือกช่วงวันที่ให้แคบลง</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="ยอดขาย" value={money(t.revenue)} hint={`${report.orderCount.toLocaleString("th-TH")} คำสั่งซื้อ · ${t.lines.toLocaleString("th-TH")} ชิ้น`} />
        <Kpi label="ต้นทุน" value={money(t.cost)} hint={`จาก ${(t.lines - t.missingLines).toLocaleString("th-TH")} ชิ้นที่มีต้นทุน`} />
        <Kpi label="กำไร" value={money(t.profit)} hint={`อัตรากำไร ${pct(t)} (เฉพาะชิ้นที่มีต้นทุน)`} tone="positive" />
        <Kpi
          label={PENDING}
          value={t.missingLines.toLocaleString("th-TH")}
          hint={t.missingLines > 0 ? `ยอดขาย ${money(t.missingRevenue)} ยังไม่ได้คิดกำไร` : "ครบทุกรายการ"}
          tone={t.missingLines > 0 ? "warning" : undefined}
        />
      </div>
      {report.licenseCount > 0 && (
        <p className="text-sm text-muted-foreground">
          รายได้ Commercial license ช่วงนี้ {money(report.licenseRevenue)} ({report.licenseCount} คำสั่งซื้อ) ไม่มีต้นทุน จึงแยกไว้ไม่รวมในตัวเลขด้านบน
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
          <h2 className="font-semibold">ตามแบรนด์ (โฟลเดอร์)</h2>
          <GroupTable rows={report.folders} />
        </section>
        <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
          <h2 className="font-semibold">สินค้าขายดี</h2>
          <GroupTable rows={report.topProducts} units />
        </section>
      </div>

      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
        <h2 className="font-semibold">รายคำสั่งซื้อ</h2>
        {report.orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีคำสั่งซื้อที่ชำระแล้วในช่วงนี้</p>
        ) : (
          <ul className="divide-y">
            {report.orders.map((o) => (
              <li key={o.id} className="py-3">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
                    <span className="font-medium tabular-nums">{o.orderNumber}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.paidAt ? formatBangkokDateTime(o.paidAt) : ""} · {o.user.email}
                    </span>
                    <span className="ml-auto flex gap-4 text-sm tabular-nums">
                      <span>ขาย {money(o.totals?.revenue ?? 0)}</span>
                      <span className="text-muted-foreground">ทุน {money(o.totals?.cost ?? 0)}</span>
                      <span className="font-medium text-success">กำไร {money(o.totals?.profit ?? 0)}</span>
                      {o.totals && o.totals.missingLines > 0 && <span className="text-warning">{PENDING} {o.totals.missingLines}</span>}
                    </span>
                  </summary>
                  <ul className="mt-2 space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
                    {o.items.map((i) => (
                      <li key={i.id} className="flex flex-wrap justify-between gap-x-4">
                        <span className="min-w-0">
                          {i.productNameTHSnapshot}
                          {i.variantNameTHSnapshot && <span className="text-muted-foreground"> · {i.variantNameTHSnapshot}</span>}
                        </span>
                        <span className="flex gap-4 tabular-nums">
                          <span>{money(toHundredths(i.finalPrice))}</span>
                          {i.cost === null ? (
                            <span className="text-warning">{PENDING}</span>
                          ) : (
                            <>
                              <span className="text-muted-foreground">
                                ทุน {money(toHundredths(i.cost))} (¥{i.costYuan?.toString()}
                                {i.costIsPromo ? " ราคาพิเศษ" : ""})
                              </span>
                              <span>กำไร {money(toHundredths(i.finalPrice) - toHundredths(i.cost))}</span>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={parsed.page} pageCount={report.pageCount} params={{ from: fromKey, to: toKey }} basePath="/admin/profit" />
      </section>

      <CostSheetPanel
        sheetUrl={settings.sheetId ? `https://docs.google.com/spreadsheets/d/${settings.sheetId}/edit` : ""}
        rate={settings.rate}
        syncedAt={settings.syncedAt ? formatBangkokDateTime(settings.syncedAt) : null}
      />

      <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
        <h2 className="font-semibold">สินค้าที่ยังไม่พบต้นทุนในชีต ({missing.length.toLocaleString("th-TH")})</h2>
        <p className="text-sm text-muted-foreground">
          เพิ่มแถวในแท็บของโฟลเดอร์นั้น (ชื่ออังกฤษตรงกับชื่อสินค้า) แล้วกด “ดึงข้อมูลจาก Sheet” · ตัวเลือกของสินค้าใช้แถว “ชื่อสินค้า (ตัวเลือก)” เช่น Chibi Head2(1) ถ้าไม่มีจะใช้แถวของสินค้า
        </p>
        {missing.length > 0 && (
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {missing.map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <Link href={`/admin/products/${p.id}`} className="truncate hover:underline">
                  {p.name}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">{p.folder ?? "ไม่มีโฟลเดอร์"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GroupTable({ rows, units = false }: { rows: (ProfitTotals & { key: string; name: string })[]; units?: boolean }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground [&>th]:pb-2 [&>th]:font-medium">
          <th>{units ? "สินค้า" : "แบรนด์"}</th>
          {units && <th className="text-right">ชิ้น</th>}
          <th className="text-right">ยอดขาย</th>
          <th className="text-right">กำไร</th>
          <th className="text-right">อัตรา</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r) => (
          <tr key={r.key} className="[&>td]:py-1.5">
            <td className="max-w-0 truncate pr-2">
              {r.name}
              {r.missingLines > 0 && <span className="ml-1 text-xs text-warning">({PENDING} {r.missingLines})</span>}
            </td>
            {units && <td className="text-right tabular-nums">{r.lines}</td>}
            <td className="text-right tabular-nums">{money(r.revenue)}</td>
            <td className="text-right tabular-nums">{money(r.profit)}</td>
            <td className="text-right text-muted-foreground tabular-nums">{pct(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
