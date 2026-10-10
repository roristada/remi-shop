import { formatTHB } from "@/lib/pricing/calculate";
import type { ProfitTotals } from "@/lib/costs/profit";
import { cn } from "@/lib/utils";

type Split = Pick<ProfitTotals, "revenue" | "cost" | "profit" | "missingRevenue">;

/** How each baht of sales splits: cost, profit, and sales whose cost is not recorded yet (satang). */
export function splitParts(t: Split) {
  const base = Math.max(t.revenue, 1);
  // A loss: cost eats the whole costed share, so cost fills it and profit shows nothing.
  const costShown = Math.min(t.cost, t.revenue - t.missingRevenue);
  return [
    { key: "cost", label: "ต้นทุน", value: t.cost, share: costShown / base, className: "bg-chart-cost" },
    { key: "profit", label: "กำไร", value: t.profit, share: Math.max(t.profit, 0) / base, className: "bg-chart-profit" },
    { key: "pending", label: "รอระบุต้นทุน", value: t.missingRevenue, share: t.missingRevenue / base, className: "bg-chart-pending" },
  ].filter((p) => p.share > 0);
}

const pct = (share: number) => `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;

/**
 * One horizontal bar split into cost / profit / not-yet-costed. `length` (0–1) scales the whole
 * bar against a larger total (brand rows); segments keep a 2px gap and rounded ends.
 */
export function ProfitSplitBar({ totals, length = 1, size = "md", label }: { totals: Split; length?: number; size?: "md" | "sm"; label: string }) {
  const parts = splitParts(totals);
  const summary = parts.map((p) => `${p.label} ${formatTHB(p.value)} (${pct(p.share)})`).join(", ");
  return (
    <div
      role="img"
      aria-label={`${label}: ${summary}`}
      className={cn("flex gap-0.5", size === "md" ? "h-3" : "h-2")}
      style={{ width: `${Math.max(length, 0.02) * 100}%` }}
    >
      {parts.map((p) => (
        <span
          key={p.key}
          title={`${p.label} ${formatTHB(p.value)} · ${pct(p.share)} ของยอดขาย`}
          className={cn("h-full min-w-1 rounded-[4px] first:rounded-l-full last:rounded-r-full", p.className)}
          style={{ flexGrow: p.share, flexBasis: 0 }}
        />
      ))}
    </div>
  );
}

/** Legend with each part's share of sales, so identity never rests on colour alone. */
export function ProfitSplitLegend({ totals }: { totals: Split }) {
  const parts = splitParts(totals);
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
      {parts.map((p) => (
        <li key={p.key} className="flex items-center gap-2">
          <span aria-hidden className={cn("size-3 shrink-0 rounded-[3px]", p.className)} />
          <span className="text-muted-foreground">{p.label}</span>
          <span className="font-medium tabular-nums">{pct(p.share)}</span>
        </li>
      ))}
    </ul>
  );
}
