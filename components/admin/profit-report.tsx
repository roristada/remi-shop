import Link from "next/link";
import { connection } from "next/server";
import { AlertTriangle, CalendarRange, ChevronDown, ChevronRight } from "lucide-react";
import { formatBangkokDateTime } from "@/lib/datetime";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import { getCostSettings, listProductsWithoutCost } from "@/lib/costs/service";
import { countPaidProductOrders, getProfitSummary, listProfitOrders } from "@/lib/costs/report";
import { marginBp, type ProfitGroup, type ProfitTotals } from "@/lib/costs/profit";
import { formatPeriod, parsePeriod, PERIOD_PRESETS, type Period } from "@/lib/costs/period";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/shared/pagination";
import { CostSheetPanel } from "@/components/admin/cost-sheet-panel";
import { ProfitSplitBar, ProfitSplitLegend } from "@/components/admin/profit-split-bar";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "overview", label: "ภาพรวม" },
  { key: "orders", label: "รายคำสั่งซื้อ" },
  { key: "data", label: "ข้อมูลต้นทุน" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const PENDING = "รอระบุต้นทุน";
const count = (n: number) => n.toLocaleString("th-TH");

function margin(t: Pick<ProfitTotals, "costedRevenue" | "profit">) {
  const bp = marginBp(t);
  return bp === null ? "—" : `${(bp / 100).toFixed(1)}%`;
}

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-2xl border bg-card p-5 shadow-soft", className)}>{children}</section>;
}

/** Period and tab live in the URL so every view can be bookmarked and shared between admins. */
function href(tab: Tab, period: Period, extra: Record<string, string> = {}) {
  const qs = new URLSearchParams(
    period.key === "custom" ? { from: period.fromKey, to: period.toKey } : period.key === "month" ? {} : { period: period.key },
  );
  if (tab !== "overview") qs.set("tab", tab);
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const s = qs.toString();
  return s ? `/admin/profit?${s}` : "/admin/profit";
}

/** The whole report; the route does the admin check before rendering it. */
export async function ProfitReport({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  await connection(); // "This month" depends on the current time.
  const now = new Date();
  const period = parsePeriod(sp, now);
  const tab: Tab = TABS.find((t) => t.key === sp.tab)?.key ?? "overview";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));

  // Everything a tab needs is fetched at once (no waterfall); only the overview computes the summary.
  const [summary, orderCount, missing, orders, settings] = await Promise.all([
    tab === "overview" ? getProfitSummary(period.from, period.to) : null,
    tab === "overview" ? null : countPaidProductOrders(period.from, period.to),
    listProductsWithoutCost(1000),
    tab === "orders" ? listProfitOrders(period.from, period.to, page) : null,
    tab === "data" ? getCostSettings() : null,
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">ต้นทุนและกำไร</h1>
          <p className="text-sm text-muted-foreground">
            {formatPeriod(period.from, period.to)} · {count(summary?.orderCount ?? orderCount ?? 0)} คำสั่งซื้อที่ชำระแล้ว
          </p>
        </div>
        <PeriodPicker period={period} tab={tab} />
      </header>

      <nav aria-label="มุมมอง" className="flex gap-1 rounded-full bg-card p-1 shadow-soft sm:w-fit">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={href(item.key, period)}
            aria-current={item.key === tab ? "page" : undefined}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm transition-colors sm:flex-none",
              item.key === tab ? "bg-primary font-medium" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {item.label}
            {item.key === "data" && missing.length > 0 && (
              <span className="rounded-full bg-warning/15 px-1.5 text-xs font-medium text-warning tabular-nums">{count(missing.length)}</span>
            )}
          </Link>
        ))}
      </nav>

      {summary?.truncated && (
        <p role="status" className="rounded-xl bg-warning/10 px-4 py-2 text-sm text-warning">
          ช่วงเวลานี้มีข้อมูลมากเกินไป ตัวเลขด้านล่างนับได้ไม่ครบ กรุณาเลือกช่วงให้สั้นลง
        </p>
      )}

      {summary && <Overview summary={summary} period={period} />}
      {orders && <Orders data={orders} period={period} page={page} />}
      {settings && <CostData settings={settings} missing={missing} />}
    </div>
  );
}

function PeriodPicker({ period, tab }: { period: Period; tab: Tab }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="ช่วงเวลา" className="flex flex-wrap gap-1">
        {PERIOD_PRESETS.map((p) => (
          <Link
            key={p.key}
            href={href(tab, { ...period, key: p.key })}
            aria-current={period.key === p.key ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              period.key === p.key ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <details className="group relative">
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors [&::-webkit-details-marker]:hidden",
            period.key === "custom" ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarRange className="size-4" aria-hidden /> กำหนดเอง
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <form className="absolute right-0 z-10 mt-2 flex w-72 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft">
          {tab !== "overview" && <input type="hidden" name="tab" value={tab} />}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ตั้งแต่วันที่
            <Input type="date" name="from" defaultValue={period.fromKey} className="h-10 rounded-xl" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ถึงวันที่
            <Input type="date" name="to" defaultValue={period.toKey} className="h-10 rounded-xl" />
          </label>
          <Button type="submit" className="h-10 rounded-full">
            ดูช่วงนี้
          </Button>
        </form>
      </details>
    </div>
  );
}

type Summary = Awaited<ReturnType<typeof getProfitSummary>>;

function Overview({ summary, period }: { summary: Summary; period: Period }) {
  const t = summary.totals;
  if (t.lines === 0) {
    return (
      <Panel className="py-14 text-center">
        <p className="font-medium">ยังไม่มีคำสั่งซื้อที่ชำระแล้วในช่วงนี้</p>
        <p className="mt-1 text-sm text-muted-foreground">ลองเลือกช่วงเวลาอื่นด้านบน</p>
      </Panel>
    );
  }
  const loss = t.profit < 0;
  const maxBrand = Math.max(...summary.folders.map((f) => f.revenue), 1);

  return (
    <>
      <Panel className="space-y-5 p-6">
        <h2 className="sr-only">สรุปกำไร</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-start">
          <Figure label="ยอดขาย" value={formatTHB(t.revenue)} note={`${count(t.lines)} ชิ้น`} />
          <Operator>−</Operator>
          <Figure label="ต้นทุน" value={formatTHB(t.cost)} note={t.missingLines > 0 ? `ไม่รวม ${count(t.missingLines)} ชิ้นที่${PENDING}` : "ครบทุกชิ้น"} />
          <Operator>=</Operator>
          <Figure
            label={loss ? "ขาดทุน" : "กำไร"}
            value={formatTHB(Math.abs(t.profit))}
            note={`อัตรากำไร ${margin(t)}`}
            tone={loss ? "negative" : "positive"}
            lead
            className="col-span-2 border-t pt-4 sm:col-span-1 sm:border-0 sm:pt-0"
          />
        </dl>

        <div className="space-y-2.5 border-t pt-5">
          <ProfitSplitBar totals={t} label="สัดส่วนของยอดขาย" />
          <ProfitSplitLegend totals={t} />
        </div>

        {(t.missingLines > 0 || summary.licenseCount > 0) && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {t.missingLines > 0 && (
              <li className="flex flex-wrap items-center gap-x-2">
                <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
                ยอดขาย {formatTHB(t.missingRevenue)} ยังไม่มีต้นทุน จึงยังไม่นับเป็นกำไร
                <Link href={href("data", period)} className="font-medium text-brand-strong underline-offset-4 hover:underline">
                  เติมต้นทุน
                </Link>
              </li>
            )}
            {summary.licenseCount > 0 && (
              <li>
                รายได้ Commercial license {formatTHB(summary.licenseRevenue)} ({count(summary.licenseCount)} คำสั่งซื้อ) ไม่มีต้นทุน แยกไว้ไม่รวมด้านบน
              </li>
            )}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel className="space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">ตามแบรนด์</h2>
            <p className="text-xs text-muted-foreground">ความยาวแถบ = ยอดขาย · สีแบ่งต้นทุนกับกำไร</p>
          </div>
          <ol className="space-y-4">
            {summary.folders.map((f) => (
              <BrandRow key={f.key} group={f} length={f.revenue / maxBrand} />
            ))}
          </ol>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="font-semibold">สินค้าขายดี</h2>
          <ol className="divide-y">
            {summary.topProducts.map((p, i) => (
              <li key={p.key} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-4 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.name}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {count(p.lines)} ชิ้น · ขาย {formatTHB(p.revenue)}
                  </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  {p.missingLines === p.lines ? (
                    <span className="text-xs text-warning">{PENDING}</span>
                  ) : (
                    <>
                      <span className={cn("block font-medium", p.profit < 0 && "text-destructive")}>{formatTHB(p.profit)}</span>
                      <span className="block text-xs text-muted-foreground">กำไร {margin(p)}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
  lead = false,
  className,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "positive" | "negative";
  lead?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          // Same line box for every figure so the three labels and values line up.
          "h-10 font-semibold leading-10 tabular-nums",
          lead ? "text-3xl" : "text-2xl",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

function Operator({ children }: { children: string }) {
  return (
    <span aria-hidden className="hidden pt-6 text-2xl leading-10 text-muted-foreground/60 sm:block">
      {children}
    </span>
  );
}

function BrandRow({ group: g, length }: { group: ProfitGroup; length: number }) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{g.name}</span>
        <span className="shrink-0 tabular-nums">{formatTHB(g.revenue)}</span>
      </div>
      <ProfitSplitBar totals={g} length={length} size="sm" label={g.name} />
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums">
        <span>ทุน {formatTHB(g.cost)}</span>
        <span className={cn(g.profit < 0 && "text-destructive")}>กำไร {formatTHB(g.profit)}</span>
        <span>{margin(g)}</span>
        {g.missingLines > 0 && <span className="text-warning">{PENDING} {count(g.missingLines)} ชิ้น</span>}
      </p>
    </li>
  );
}

function Orders({ data, period, page }: { data: Awaited<ReturnType<typeof listProfitOrders>>; period: Period; page: number }) {
  const { orders, pageCount } = data;
  if (orders.length === 0) {
    return (
      <Panel className="py-14 text-center">
        <p className="font-medium">ยังไม่มีคำสั่งซื้อที่ชำระแล้วในช่วงนี้</p>
      </Panel>
    );
  }
  const grid = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_6.5rem_6.5rem_7.5rem]";
  return (
    <Panel className="p-0">
      <div className={cn(grid, "border-b px-5 py-3 text-xs font-medium text-muted-foreground")} aria-hidden>
        <span>คำสั่งซื้อ</span>
        <span className="hidden sm:block">ลูกค้า</span>
        <span className="hidden text-right sm:block">ยอดขาย</span>
        <span className="hidden text-right sm:block">ต้นทุน</span>
        <span className="text-right">กำไร</span>
      </div>
      <ul className="divide-y">
        {orders.map((o) => (
          <li key={o.id}>
            <details className="group">
              <summary className={cn(grid, "cursor-pointer list-none items-center px-5 py-3 text-sm hover:bg-muted/40 [&::-webkit-details-marker]:hidden")}>
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium tabular-nums">{o.orderNumber}</span>
                    <span className="block text-xs text-muted-foreground">{o.paidAt ? formatBangkokDateTime(o.paidAt) : ""}</span>
                  </span>
                </span>
                <span className="hidden min-w-0 truncate text-muted-foreground sm:block">{o.user.displayName ?? o.user.email}</span>
                <span className="hidden text-right tabular-nums sm:block">{formatTHB(o.totals.revenue)}</span>
                {/* No line costed yet: say so, never a ฿0 that reads like a real figure. */}
                <span className="hidden text-right text-muted-foreground tabular-nums sm:block">
                  {o.totals.costedRevenue === 0 ? "—" : formatTHB(o.totals.cost)}
                </span>
                <span className="text-right tabular-nums">
                  {o.totals.costedRevenue === 0 ? (
                    <span className="block text-muted-foreground">—</span>
                  ) : (
                    <span className={cn("block font-medium", o.totals.profit < 0 ? "text-destructive" : "text-success")}>
                      {formatTHB(o.totals.profit)}
                    </span>
                  )}
                  {o.totals.missingLines > 0 && <span className="block text-xs text-warning">{PENDING} {o.totals.missingLines}</span>}
                </span>
              </summary>
              <ul className="space-y-1.5 bg-muted/40 px-5 py-3 text-sm sm:pl-11">
                {o.items.map((i) => {
                  const sale = toHundredths(i.finalPrice);
                  const cost = i.cost === null ? null : toHundredths(i.cost);
                  return (
                    <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <span className="min-w-0">
                        {i.productNameTHSnapshot}
                        {i.variantNameTHSnapshot && <span className="text-muted-foreground"> · {i.variantNameTHSnapshot}</span>}
                      </span>
                      <span className="flex gap-4 text-xs tabular-nums sm:text-sm">
                        <span>ขาย {formatTHB(sale)}</span>
                        {cost === null ? (
                          <span className="text-warning">{PENDING}</span>
                        ) : (
                          <>
                            <span className="text-muted-foreground">
                              ทุน {formatTHB(cost)} · ¥{i.costYuan?.toString()}
                              {i.costIsPromo ? " (ราคาพิเศษ)" : ""}
                            </span>
                            <span className={cn(sale - cost < 0 && "text-destructive")}>กำไร {formatTHB(sale - cost)}</span>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <div className="border-t px-5 py-3">
        <Pagination
          page={page}
          pageCount={pageCount}
          params={{
            tab: "orders",
            ...(period.key === "custom" ? { from: period.fromKey, to: period.toKey } : period.key === "month" ? {} : { period: period.key }),
          }}
          basePath="/admin/profit"
        />
      </div>
    </Panel>
  );
}

function CostData({
  settings,
  missing,
}: {
  settings: Awaited<ReturnType<typeof getCostSettings>>;
  missing: { id: string; name: string; folder: string | null }[];
}) {
  const byFolder = new Map<string, typeof missing>();
  for (const m of missing) byFolder.set(m.folder ?? "ไม่มีโฟลเดอร์", [...(byFolder.get(m.folder ?? "ไม่มีโฟลเดอร์") ?? []), m]);

  return (
    <div className="space-y-6">
      <CostSheetPanel
        sheetUrl={settings.sheetId ? `https://docs.google.com/spreadsheets/d/${settings.sheetId}/edit` : ""}
        rate={settings.rate}
        syncedAt={settings.syncedAt ? formatBangkokDateTime(settings.syncedAt) : null}
      />
      <Panel className="space-y-4">
        <div>
          <h2 className="font-semibold">สินค้าที่ยังไม่พบต้นทุนในชีต ({count(missing.length)})</h2>
          <p className="text-sm text-muted-foreground">
            เพิ่มแถวในแท็บของแบรนด์นั้น ชื่ออังกฤษตรงกับชื่อสินค้า แล้วกด “ดึงข้อมูลจาก Sheet” · ตัวเลือกใช้แถว “ชื่อสินค้า (ตัวเลือก)”
          </p>
        </div>
        {missing.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">สินค้าทุกชิ้นมีต้นทุนแล้ว</p>
        ) : (
          <div className="gap-x-8 sm:columns-2 lg:columns-3">
            {[...byFolder].map(([folder, items]) => (
              <section key={folder} className="mb-5 space-y-1.5 break-inside-avoid">
                <h3 className="flex items-baseline justify-between gap-2 border-b pb-1 text-sm font-medium">
                  <span className="truncate">{folder}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{count(items.length)}</span>
                </h3>
                <ul className="space-y-1 text-sm">
                  {items.map((m) => (
                    <li key={`${m.id}-${m.name}`}>
                      <Link href={`/admin/products/${m.id}`} className="block truncate text-muted-foreground hover:text-foreground hover:underline">
                        {m.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
