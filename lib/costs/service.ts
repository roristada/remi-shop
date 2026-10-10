import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { fromHundredths } from "@/lib/pricing/calculate";
import { conflictingRows, costSatang, parseCostTab, parseSheetTabs, pickLineCost, type CostRow } from "@/lib/costs/sheet";

type Db = Prisma.TransactionClient | typeof prisma;

const FETCH_TIMEOUT_MS = 15_000;
const SHEET_BASE = "https://docs.google.com/spreadsheets/d";
/** Completed lines filled per sync run (older history is filled on the next sync). */
const BACKFILL_LIMIT = 5000;

export async function getCostSettings(db: Db = prisma) {
  const s = await db.storeSetting.findUnique({ where: { id: 1 }, select: { costSheetId: true, costRate: true, costSyncedAt: true } });
  return { sheetId: s?.costSheetId ?? null, rate: s?.costRate.toString() ?? "5.1", syncedAt: s?.costSyncedAt ?? null };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const folderTabName = (f: { nameTH: string; nameEN: string }) => f.nameTH.trim();

/**
 * Cost of each line of one order, taken when it completes (inside the caller's transaction) and
 * never changed afterwards. Lines without a matching sheet row stay null ("รอระบุต้นทุน") until a
 * later sync finds them. Variant lines: see pickLineCost.
 */
export async function snapshotOrderCosts(tx: Prisma.TransactionClient, orderId: string, at: Date): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, cost: null },
    select: {
      id: true,
      discount: true,
      variant: { select: { nameTH: true, nameEN: true } },
      product: { select: { nameTH: true, nameEN: true, folder: { select: { nameTH: true, nameEN: true } } } },
    },
  });
  if (items.length === 0) return;
  const tabs = [...new Set(items.flatMap((i) => (i.product.folder ? [folderTabName(i.product.folder)] : [])))];
  if (tabs.length === 0) return;
  const [{ rate }, refs] = await Promise.all([getCostSettings(tx), tx.costReference.findMany({ where: { tab: { in: tabs } } })]);
  for (const item of items) {
    if (!item.product.folder) continue;
    const tab = folderTabName(item.product.folder);
    // Units sold at a discount use the discount cost (see pickCost).
    const tabRefs = refs.filter((r) => r.tab === tab);
    const discounted = Number(item.discount) > 0;
    const ref = pickLineCost(tabRefs, item.product, item.variant, at, discounted);
    if (!ref) continue;
    const normal = discounted ? pickLineCost(tabRefs, item.product, item.variant, at, false) : ref;
    await tx.orderItem.update({
      where: { id: item.id },
      data: {
        costYuan: ref.costYuan,
        costRate: rate,
        cost: fromHundredths(costSatang(ref.costYuan, rate)),
        // The discount cost was used (a "(ราคาพิเศษ)" row or the lower of two same-name rows).
        costIsPromo: ref.id !== normal?.id,
      },
    });
  }
}

export type CostSyncReport = {
  tabsRead: number;
  rows: number;
  skippedRows: number;
  missingTabs: string[];
  filledLines: number;
  unmatchedProducts: number;
  /** Same name with more than two prices in a tab: ambiguous; fix the sheet. */
  conflicts: string[];
};

/**
 * Pulls the cost sheet: reads its tab list, fetches each folder's tab by gid, and replaces every
 * stored cost row in one transaction (re-importing the same sheet never duplicates anything; a
 * failed fetch changes nothing). Then fills the cost of completed lines that still have none.
 */
export async function syncCostSheet(): Promise<{ ok: true; report: CostSyncReport } | { ok: false; error: string }> {
  const { sheetId } = await getCostSettings();
  if (!sheetId) return { ok: false, error: "ยังไม่ได้ตั้งค่า Google Sheet ต้นทุน" };

  const folders = await prisma.folder.findMany({ select: { nameTH: true, nameEN: true } });
  let tabs: Map<string, string>;
  try {
    tabs = parseSheetTabs(await fetchText(`${SHEET_BASE}/${encodeURIComponent(sheetId)}/htmlview`));
  } catch (error) {
    console.error("[costs] sheet tab list failed", { message: (error as Error).message });
    return { ok: false, error: "เปิด Google Sheet ไม่ได้ ตรวจว่าแชร์แบบ “ทุกคนที่มีลิงก์ดูได้”" };
  }
  if (tabs.size === 0) return { ok: false, error: "ไม่พบแท็บใน Google Sheet ตรวจว่าแชร์แบบ “ทุกคนที่มีลิงก์ดูได้”" };

  const rows: CostRow[] = [];
  const missingTabs: string[] = [];
  let skippedRows = 0;
  let tabsRead = 0;
  for (const folder of folders) {
    const tab = folderTabName(folder);
    const gid = tabs.get(tab);
    if (gid === undefined) {
      missingTabs.push(tab);
      continue;
    }
    try {
      const csv = await fetchText(`${SHEET_BASE}/${encodeURIComponent(sheetId)}/export?format=csv&gid=${gid}`);
      const parsed = parseCostTab(tab, csv);
      rows.push(...parsed.rows);
      skippedRows += parsed.skipped;
      tabsRead++;
    } catch (error) {
      console.error("[costs] sheet tab fetch failed", { tab, message: (error as Error).message });
      return { ok: false, error: `ดึงแท็บ “${tab}” ไม่สำเร็จ ข้อมูลเดิมยังอยู่ กรุณาลองใหม่` };
    }
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.costReference.deleteMany({}),
    prisma.costReference.createMany({
      data: rows.map((r) => ({
        tab: r.tab,
        nameEN: r.nameEN,
        nameZH: r.nameZH,
        matchEN: r.matchEN,
        matchZH: r.matchZH,
        costYuan: r.costYuan,
        isPromo: r.isPromo,
        promoStartAt: r.promoStartAt,
        promoEndAt: r.promoEndAt,
        importedAt: now,
      })),
    }),
    prisma.storeSetting.upsert({ where: { id: 1 }, create: { id: 1, costSyncedAt: now }, update: { costSyncedAt: now } }),
  ]);

  const filledLines = await backfillMissingCosts();
  const unmatchedProducts = (await listProductsWithoutCost(1000)).length;
  console.info("[costs] sheet synced", { tabsRead, rows: rows.length, skippedRows, missingTabs: missingTabs.length, filledLines });
  const conflicts = conflictingRows(rows);
  return { ok: true, report: { tabsRead, rows: rows.length, skippedRows, missingTabs, filledLines, unmatchedProducts, conflicts } };
}

/** Completed product lines with no cost yet get one from the current sheet (dated by payment time). */
async function backfillMissingCosts(): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { status: "COMPLETED", kind: "PRODUCT", items: { some: { cost: null } } },
    orderBy: { paidAt: "desc" },
    take: BACKFILL_LIMIT,
    select: { id: true, paidAt: true, createdAt: true },
  });
  let before = 0;
  let after = 0;
  for (const o of orders) {
    await prisma.$transaction(async (tx) => {
      before += await tx.orderItem.count({ where: { orderId: o.id, cost: null } });
      await snapshotOrderCosts(tx, o.id, o.paidAt ?? o.createdAt);
      after += await tx.orderItem.count({ where: { orderId: o.id, cost: null } });
    });
  }
  return before - after;
}

/** Products (or their active variants) that no current sheet row matches: what to add to the sheet. */
export async function listProductsWithoutCost(limit = 200) {
  const [products, refs] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ folder: { sortOrder: "asc" } }, { nameTH: "asc" }],
      select: {
        id: true,
        nameTH: true,
        nameEN: true,
        folder: { select: { nameTH: true, nameEN: true } },
        variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { nameTH: true, nameEN: true } },
      },
    }),
    prisma.costReference.findMany({ select: { tab: true, matchEN: true, matchZH: true, costYuan: true, isPromo: true, promoStartAt: true, promoEndAt: true } }),
  ]);
  const now = new Date();
  const byTab = new Map<string, typeof refs>();
  for (const r of refs) byTab.set(r.tab, [...(byTab.get(r.tab) ?? []), r]);
  const out: { id: string; name: string; folder: string | null }[] = [];
  for (const p of products) {
    const tabRefs = p.folder ? (byTab.get(folderTabName(p.folder)) ?? []) : [];
    const lines = p.variants.length > 0 ? p.variants : [null];
    for (const v of lines) {
      if (p.folder && pickLineCost(tabRefs, p, v, now)) continue;
      out.push({ id: p.id, name: v ? `${p.nameTH} · ${v.nameTH}` : p.nameTH, folder: p.folder ? folderTabName(p.folder) : null });
    }
  }
  return out.slice(0, limit);
}
