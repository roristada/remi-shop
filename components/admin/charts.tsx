"use client";

import { useState } from "react";
import { formatTHB } from "@/lib/pricing/calculate";
import { cn } from "@/lib/utils";

export type ValueKind = "money" | "count";

const fmt = (v: number, kind: ValueKind) => (kind === "money" ? formatTHB(v) : v.toLocaleString("th-TH"));

/** Short Thai day label, e.g. "1 ต.ค.", from a "YYYY-MM-DD" Bangkok date. */
function dayLabel(day: string) {
  return new Intl.DateTimeFormat("th-TH-u-ca-gregory", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** A "nice" axis maximum (1, 2, 2.5, 5 × 10^n) at or above `max`. */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * exp >= max) ?? 10;
  return step * exp;
}

/**
 * One series of daily values as vertical bars (single hue, so no legend: the card title names it).
 * Bars are drawn in an SVG stretched to the plot box; axis labels are HTML so their size never
 * scales with the panel width. Hovering a day shows its value; the table toggle gives the text.
 */
export function DailyBarChart({ points, kind, label }: { points: { day: string; value: number }[]; kind: ValueKind; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const rawMax = niceMax(Math.max(...points.map((p) => p.value)));
  const max = kind === "count" ? Math.ceil(rawMax) : rawMax;
  // Counts get whole-number ticks only (no "2.5 orders").
  const ticks = [max, max / 2, 0].filter((t) => kind === "money" || Number.isInteger(t));
  const n = points.length;
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const hovered = hover === null ? null : points[hover];
  const pct = (v: number) => (v / max) * 100;
  // Weekly ticks plus the last day, unless that would crowd the previous tick.
  const showTick = (i: number) => (i % 7 === 0 && n - 1 - i >= 4) || i === n - 1;
  const tickValue = (t: number) => (kind === "money" ? formatTHB(t) : t.toLocaleString("th-TH"));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* Y axis */}
        <div className="relative h-52 w-12 text-right text-xs text-muted-foreground tabular-nums sm:h-60" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - pct(t)}%` }}>
              {tickValue(t)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative h-52 sm:h-60" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border" style={{ top: `${100 - pct(t)}%` }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex items-end" role="img" aria-label={`${label}รายวัน รวม ${fmt(total, kind)}`}>
            {points.map((p, i) => (
              <div
                key={p.day}
                className="flex h-full flex-1 items-end px-px"
                onMouseEnter={() => setHover(i)}
              >
                {p.value > 0 && (
                  // Rounded data end only; the base sits flat on the baseline.
                  <div
                    className={cn(
                      "w-full rounded-t-[4px] transition-colors duration-150",
                      hover === i ? "bg-brand-strong" : "bg-brand-strong/75",
                    )}
                    style={{ height: `${pct(p.value)}%` }}
                  />
                )}
              </div>
            ))}
          </div>
          {hovered && hover !== null && (
            <div
              className={cn(
                "pointer-events-none absolute top-0 z-10 rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md",
                // Keep the tooltip inside the panel at either end.
                hover < 3 ? "translate-x-0" : hover > n - 4 ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${((hover + 0.5) / n) * 100}%` }}
            >
              <p className="text-muted-foreground">{dayLabel(hovered.day)}</p>
              <p className="font-semibold tabular-nums">{fmt(hovered.value, kind)}</p>
            </div>
          )}
        </div>

        {/* X axis */}
        <div aria-hidden />
        <div className="relative mt-1.5 h-4 text-xs text-muted-foreground" aria-hidden>
          {points.map((p, i) =>
            showTick(i) ? (
              <span
                key={p.day}
                className={cn(
                  "absolute whitespace-nowrap",
                  i === n - 1 ? "-translate-x-full" : i === 0 ? "translate-x-0" : "-translate-x-1/2",
                )}
                style={{ left: `${(i === n - 1 ? 1 : (i + 0.5) / n) * 100}%` }}
              >
                {dayLabel(p.day)}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <TableToggle
        caption={label}
        head={["วันที่", label]}
        rows={points.map((p) => [dayLabel(p.day), fmt(p.value, kind)])}
      />
    </div>
  );
}

/**
 * Ranked horizontal bars (single hue, magnitude only). Each bar carries its value as a direct
 * label, which is what a ranking is read for.
 */
export function RankBars({
  rows,
  empty,
}: {
  rows: { id: string; name: string; revenue: number; units: number }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <div className="space-y-2">
      <ol className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="space-y-1" title={`${r.name}: ${formatTHB(r.revenue)} · ${r.units} ชิ้น`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{r.name}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {formatTHB(r.revenue)} <span className="text-xs font-normal text-muted-foreground">· {r.units} ชิ้น</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-brand-strong/75" style={{ width: `${Math.max(2, (r.revenue / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ol>
      <TableToggle
        caption="ยอดขาย"
        head={["รายการ", "ยอดขาย", "ชิ้น"]}
        rows={rows.map((r) => [r.name, formatTHB(r.revenue), r.units.toLocaleString("th-TH")])}
      />
    </div>
  );
}

function TableToggle({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">ดูเป็นตาราง</summary>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {head.map((h, i) => (
                <th key={h} className={i === 0 ? "px-3 py-1.5 font-medium" : "px-3 py-1.5 text-right font-medium"}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r[0]}>
                {r.map((c, i) => (
                  <td key={i} className={i === 0 ? "px-3 py-1.5" : "px-3 py-1.5 text-right tabular-nums"}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

type Metric = "revenue" | "orders";
const METRICS: { key: Metric; label: string; kind: ValueKind }[] = [
  { key: "revenue", label: "ยอดขาย", kind: "money" },
  { key: "orders", label: "คำสั่งซื้อ", kind: "count" },
];

/**
 * One daily chart with a revenue / orders switch. Two measures of different scale never share
 * an axis, so the switch swaps the whole series instead of overlaying them.
 */
export function DailyMetricChart({
  daily,
  days,
}: {
  daily: { day: string; revenue: number; orders: number }[];
  days: number;
}) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const current = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const points = daily.map((p) => ({ day: p.day, value: p[metric] }));
  const total = points.reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">{current.label}รายวัน</h2>
          <p className="text-sm text-muted-foreground">
            {days} วันล่าสุด · รวม <span className="font-semibold text-foreground tabular-nums">{fmt(total, current.kind)}</span>
          </p>
        </div>
        {/* Segmented toggle: powder-sky track, the active segment on paper. */}
        <div role="group" aria-label="เลือกข้อมูลที่แสดง" className="inline-flex rounded-full bg-secondary p-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={m.key === metric}
              onClick={() => setMetric(m.key)}
              className={cn(
                "h-9 rounded-full px-4 text-sm transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/80 focus-visible:outline-none",
                m.key === metric ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <DailyBarChart key={metric} points={points} kind={current.kind} label={current.label} />
    </div>
  );
}
