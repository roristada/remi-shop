import Link from "next/link";
import { connection } from "next/server";
import { AlertTriangle, BadgeCheck, CheckCircle2, ChevronLeft, ChevronRight, Stamp } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import {
  DASHBOARD_WINDOW_DAYS,
  firstSalesYear,
  getDashboardData,
  getMonthStatement,
  getYearTotals,
  type PeriodSummary,
} from "@/lib/admin/dashboard-queries";
import { monthKey, parseMonthParam, type YearMonth } from "@/lib/admin/dashboard";
import { formatTHB } from "@/lib/pricing/calculate";
import { Button } from "@/components/ui/button";
import { DailyMetricChart, RankBars } from "@/components/admin/charts";
import { cn } from "@/lib/utils";

const count = (n: number) => n.toLocaleString("th-TH");

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-2xl border bg-card p-5 shadow-soft", className)}>{children}</section>;
}

/**
 * Month-to-date against the same stretch of last month, so the first days of a month don't read
 * as a collapse. Nothing to compare against → no percentage (never an invented one).
 */
function Change({ now, before }: { now: number; before: number }) {
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {pct > 0 ? "+" : pct < 0 ? "−" : "±"}
      {Math.abs(pct)}%
    </span>
  );
}

const SUMMARY_ROWS: { key: keyof PeriodSummary; label: string; kind: "money" | "count"; unit?: string }[] = [
  { key: "revenue", label: "ยอดขาย", kind: "money" },
  { key: "orders", label: "คำสั่งซื้อที่สำเร็จ", kind: "count" },
  { key: "customers", label: "ลูกค้าที่ซื้อ", kind: "count", unit: "คน" },
  { key: "productsSold", label: "สินค้าที่ขายได้", kind: "count", unit: "ชิ้น" },
];

function SummaryTable({
  today,
  month,
  lastMonth,
  lastMonthToDate,
}: {
  today: PeriodSummary;
  month: PeriodSummary;
  lastMonth: PeriodSummary;
  lastMonthToDate: PeriodSummary;
}) {
  const value = (v: number, kind: "money" | "count", unit?: string) =>
    kind === "money" ? formatTHB(v) : unit ? `${count(v)} ${unit}` : count(v);
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">สรุปยอดขาย</caption>
      <thead>
        <tr className="text-xs text-muted-foreground [&>th]:pb-3 [&>th]:font-medium">
          <th scope="col" className="text-left">
            <span className="sr-only">รายการ</span>
          </th>
          <th scope="col" className="text-right">วันนี้</th>
          <th scope="col" className="text-right">เดือนนี้</th>
          <th scope="col" className="hidden text-right sm:table-cell">เดือนที่แล้ว</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {SUMMARY_ROWS.map((r, i) => (
          <tr key={r.key} className="[&>td]:py-3">
            <th scope="row" className="text-left font-normal text-muted-foreground">
              {r.label}
            </th>
            <td className={cn("text-right tabular-nums", i === 0 ? "text-lg font-semibold" : "font-medium")}>
              {value(today[r.key], r.kind, r.unit)}
            </td>
            <td className="text-right">
              <p className={cn("tabular-nums", i === 0 ? "text-lg font-semibold" : "font-medium")}>
                {value(month[r.key], r.kind, r.unit)}
              </p>
              <Change now={month[r.key]} before={lastMonthToDate[r.key]} />
            </td>
            <td className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
              {value(lastMonth[r.key], r.kind, r.unit)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TaskRow({ href, icon: Icon, label, n, hint }: { href: string; icon: typeof Stamp; label: string; n: number; hint: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors duration-150 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:outline-none"
    >
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          n > 0 ? "bg-primary/60 text-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <span className={cn("text-lg font-semibold tabular-nums", n === 0 && "text-muted-foreground")}>{count(n)}</span>
      <ChevronRight className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("th-TH", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 15))),
);
const MONTH_LONG = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("th-TH", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 15))),
);

/**
 * Bank-statement style: pick a year, then a month; that month's figures stay separate from
 * every other month, so any past month can be checked again later.
 */
async function Statement({ selected, current }: { selected: YearMonth; current: YearMonth }) {
  const [totals, month, firstYear] = await Promise.all([getYearTotals(selected.year), getMonthStatement(selected), firstSalesYear()]);
  const minYear = Math.min(firstYear ?? current.year, current.year);
  const yearHref = (year: number) => {
    // Same month in the other year, or its last allowed month.
    const m = year === current.year ? Math.min(selected.month, current.month) : selected.month;
    return `/admin/dashboard?month=${monthKey({ year, month: m })}#statement`;
  };
  const s = month.summary;
  const tiles = [
    { label: "ยอดขาย", value: formatTHB(s.revenue) },
    { label: "คำสั่งซื้อที่สำเร็จ", value: count(s.orders) },
    { label: "ลูกค้าที่ซื้อ", value: `${count(s.customers)} คน` },
    { label: "สินค้าที่ขายได้", value: `${count(s.productsSold)} ชิ้น` },
  ];
  const label = `${MONTH_LONG[selected.month - 1]} ${selected.year}`;

  return (
    <Panel className="space-y-5">
      <div id="statement" className="flex flex-wrap items-center justify-between gap-3 scroll-mt-6">
        <div>
          <h2 className="font-semibold">ยอดขายรายเดือน</h2>
          <p className="text-sm text-muted-foreground">เลือกปีและเดือนเพื่อดูยอดย้อนหลัง · นับตามวันที่อนุมัติสลิป</p>
        </div>
        <nav aria-label="เลือกปี" className="flex items-center gap-1">
          {selected.year > minYear ? (
            <Button asChild variant="ghost" size="icon" className="rounded-full">
              <Link href={yearHref(selected.year - 1)} aria-label={`ปี ${selected.year - 1}`}>
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
          ) : (
            <span className="size-9" aria-hidden />
          )}
          <span className="min-w-16 text-center text-lg font-semibold tabular-nums">{selected.year}</span>
          {selected.year < current.year ? (
            <Button asChild variant="ghost" size="icon" className="rounded-full">
              <Link href={yearHref(selected.year + 1)} aria-label={`ปี ${selected.year + 1}`}>
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          ) : (
            <span className="size-9" aria-hidden />
          )}
        </nav>
      </div>

      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {totals.map((t) => {
          const future = selected.year === current.year && t.month > current.month;
          const active = t.month === selected.month;
          const body = (
            <>
              <span className="block text-sm font-medium">{MONTH_NAMES[t.month - 1]}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">{future ? "—" : formatTHB(t.revenue)}</span>
            </>
          );
          return (
            <li key={t.month}>
              {future ? (
                <span className="block rounded-xl border border-dashed px-3 py-2 opacity-50">{body}</span>
              ) : (
                <Link
                  href={`/admin/dashboard?month=${monthKey({ year: selected.year, month: t.month })}#statement`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-xl border px-3 py-2 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    active && "border-brand-strong bg-accent",
                  )}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      <div className="space-y-4 border-t pt-5">
        <h3 className="font-semibold">{label}</h3>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">{tile.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{tile.value}</dd>
            </div>
          ))}
        </dl>
        <DailyMetricChart daily={month.daily} days={month.daily.length} period={label} />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">สินค้าขายดี · {label}</h4>
            <RankBars rows={month.top} empty={`ไม่มียอดขายใน${label}`} />
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">ยอดขายตามหมวดหมู่ · {label}</h4>
            <RankBars rows={month.categories} empty={`ไม่มียอดขายใน${label}`} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default async function AdminDashboardPage({ searchParams }: PageProps<"/admin/dashboard">) {
  // Every admin page and server action must call requireAdmin() itself —
  // the layout check alone doesn't stop a page from rendering.
  await requireAdmin();
  await connection(); // "Today" and "this month" depend on the current time.
  const now = new Date();
  const selectedMonth = parseMonthParam((await searchParams).month, now);
  const currentMonth = parseMonthParam(undefined, now);
  const d = await getDashboardData(now);
  const window = `${DASHBOARD_WINDOW_DAYS} วันล่าสุด`;
  const today = new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(now);
  const { pendingSlips, pendingLicenses, lowStock } = d.todo;
  const nothingToDo = pendingSlips === 0 && pendingLicenses === 0 && lowStock.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">แดชบอร์ด</h1>
          <p className="text-sm text-muted-foreground">{today}</p>
        </div>
        {/* Payment review is the admin's main job, so its shortcut leads the page when there is work. */}
        {pendingSlips > 0 && (
          <Button asChild className="h-11 rounded-full px-5">
            <Link href="/admin/payments">
              <BadgeCheck aria-hidden /> ตรวจสลิป {count(pendingSlips)} รายการ
            </Link>
          </Button>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">สรุปยอดขาย</h2>
            <p className="text-xs text-muted-foreground">นับเฉพาะคำสั่งซื้อที่อนุมัติสลิปแล้ว ตามวันที่อนุมัติ</p>
          </div>
          <SummaryTable today={d.today} month={d.month} lastMonth={d.lastMonth} lastMonthToDate={d.lastMonthToDate} />
          <p className="mt-3 text-xs text-muted-foreground">% ใต้ยอดเดือนนี้ เทียบกับช่วงวันเดียวกันของเดือนที่แล้ว</p>
        </Panel>

        <Panel className="p-3">
          <h2 className="px-3 pt-2 pb-1 font-semibold">งานที่ต้องจัดการ</h2>
          {nothingToDo ? (
            <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-success" aria-hidden /> ไม่มีงานค้าง
            </p>
          ) : null}
          <div className="space-y-0.5">
            <TaskRow href="/admin/payments" icon={BadgeCheck} label="สลิปรอตรวจ" n={pendingSlips} hint="ลูกค้ารอดาวน์โหลดจนกว่าจะอนุมัติ" />
            <TaskRow href="/admin/licenses" icon={Stamp} label="คำขอ License" n={pendingLicenses} hint="รอพิจารณา" />
          </div>
          {lowStock.length > 0 && (
            <div className="mx-3 mt-2 space-y-2 border-t pt-3 pb-1">
              <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                <AlertTriangle className="size-3.5" aria-hidden /> สต็อกใกล้หมด
              </p>
              <ul className="space-y-1.5 text-sm">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <Link href={`/admin/products/${p.id}`} className="min-w-0 truncate hover:underline">
                      {p.name}
                    </Link>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {p.stock.left === 0 ? "หมดแล้ว" : `เหลือ ${p.stock.left}/${p.stock.limit}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <DailyMetricChart daily={d.daily} days={DASHBOARD_WINDOW_DAYS} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="space-y-4">
          <div>
            <h2 className="font-semibold">สินค้าขายดี</h2>
            <p className="text-sm text-muted-foreground">{window} · เรียงตามยอดขาย</p>
          </div>
          <RankBars rows={d.top} empty="ยังไม่มียอดขายใน 30 วันล่าสุด" />
        </Panel>
        <Panel className="space-y-4">
          <div>
            <h2 className="font-semibold">ยอดขายตามหมวดหมู่</h2>
            <p className="text-sm text-muted-foreground">{window}</p>
          </div>
          <RankBars rows={d.categories} empty="ยังไม่มียอดขายใน 30 วันล่าสุด" />
        </Panel>
      </div>

      <Statement selected={selectedMonth} current={currentMonth} />
    </div>
  );
}
