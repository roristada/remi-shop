// Pure profit aggregation (no DB). Amounts in satang. A line without a recorded cost is never
// counted as zero cost: its revenue is kept apart ("รอระบุต้นทุน") so profit is never overstated.

export type ProfitLine = {
  orderId: string;
  productId: string;
  productName: string;
  /** Folder (brand) name; null = no folder. */
  folder: string | null;
  revenue: number;
  /** null = no cost recorded yet. */
  cost: number | null;
};

export type ProfitTotals = {
  /** Every line's revenue. */
  revenue: number;
  /** Revenue and cost of the lines that have a cost; profit is computed on these only. */
  costedRevenue: number;
  cost: number;
  profit: number;
  lines: number;
  /** Lines (and their revenue) still waiting for a cost. */
  missingLines: number;
  missingRevenue: number;
};

export type ProfitGroup = ProfitTotals & { key: string; name: string };

const empty = (): ProfitTotals => ({ revenue: 0, costedRevenue: 0, cost: 0, profit: 0, lines: 0, missingLines: 0, missingRevenue: 0 });

function add(t: ProfitTotals, l: ProfitLine) {
  t.revenue += l.revenue;
  t.lines += 1;
  if (l.cost === null) {
    t.missingLines += 1;
    t.missingRevenue += l.revenue;
  } else {
    t.costedRevenue += l.revenue;
    t.cost += l.cost;
    t.profit = t.costedRevenue - t.cost;
  }
}

/** Margin in basis points (1% = 100) of the costed revenue; null when nothing is costed. */
export function marginBp(t: Pick<ProfitTotals, "costedRevenue" | "profit">): number | null {
  return t.costedRevenue > 0 ? Math.round((t.profit / t.costedRevenue) * 10_000) : null;
}

export function aggregateProfit(lines: ProfitLine[], topLimit = 10) {
  const totals = empty();
  const byFolder = new Map<string, ProfitGroup>();
  const byProduct = new Map<string, ProfitGroup>();
  const byOrder = new Map<string, ProfitTotals>();
  for (const l of lines) {
    add(totals, l);
    const fk = l.folder ?? "";
    if (!byFolder.has(fk)) byFolder.set(fk, { ...empty(), key: fk, name: l.folder ?? "ไม่มีโฟลเดอร์" });
    add(byFolder.get(fk)!, l);
    if (!byProduct.has(l.productId)) byProduct.set(l.productId, { ...empty(), key: l.productId, name: l.productName });
    add(byProduct.get(l.productId)!, l);
    if (!byOrder.has(l.orderId)) byOrder.set(l.orderId, empty());
    add(byOrder.get(l.orderId)!, l);
  }
  return {
    totals,
    folders: [...byFolder.values()].sort((a, b) => b.revenue - a.revenue),
    topProducts: [...byProduct.values()].sort((a, b) => b.lines - a.lines || b.revenue - a.revenue).slice(0, topLimit),
    orders: byOrder,
  };
}
