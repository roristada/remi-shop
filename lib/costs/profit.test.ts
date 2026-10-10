import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateProfit, marginBp, type ProfitLine } from "./profit";

const line = (over: Partial<ProfitLine>): ProfitLine => ({
  orderId: "o1",
  productId: "p1",
  productName: "A",
  folder: "Hot",
  revenue: 10000,
  cost: 6000,
  ...over,
});

test("missing cost is not zero cost: its revenue is kept apart", () => {
  const { totals } = aggregateProfit([line({}), line({ productId: "p2", revenue: 5000, cost: null })]);
  assert.deepEqual(totals, {
    revenue: 15000,
    costedRevenue: 10000,
    cost: 6000,
    profit: 4000,
    lines: 2,
    missingLines: 1,
    missingRevenue: 5000,
  });
  assert.equal(marginBp(totals), 4000); // 40%
  assert.equal(marginBp({ costedRevenue: 0, profit: 0 }), null);
});

test("groups by folder, product and order; top products by units", () => {
  const r = aggregateProfit([
    line({}),
    line({ orderId: "o2" }),
    line({ orderId: "o2", productId: "p2", productName: "B", folder: null, revenue: 3000, cost: 1000 }),
  ]);
  assert.deepEqual(r.folders.map((f) => [f.name, f.revenue, f.profit]), [["Hot", 20000, 8000], ["ไม่มีโฟลเดอร์", 3000, 2000]]);
  assert.deepEqual(r.topProducts.map((p) => [p.name, p.lines]), [["A", 2], ["B", 1]]);
  assert.equal(r.orders.get("o2")!.profit, 6000);
});
