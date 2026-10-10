// Pure cost-sheet rules (no DB, no network): CSV parsing, name matching and which row applies.
// Sheet layout (client's Google Sheet): one tab per folder, named exactly like the folder; columns
// "ชื่ออังกฤษ", "ชื่อจีน", "ราคา (หยวน)", optionally "เริ่มโปร" / "สิ้นสุดโปร".
// Discount cost (client, 2026-10-10): a row named "<name> (ราคาพิเศษ)", or — when the same name is
// listed twice at different prices — the lower one, is the cost of units we sold AT A DISCOUNT.
// Units sold at full price always use the normal (higher) cost.

export type CostRow = {
  tab: string;
  nameEN: string;
  nameZH: string;
  matchEN: string;
  matchZH: string;
  costYuan: string;
  isPromo: boolean;
  promoStartAt: Date | null;
  promoEndAt: Date | null;
};

const PROMO_SUFFIX = /\s*[(（]\s*ราคาพิเศษ\s*[)）]\s*$/;
const MAX_ROWS_PER_TAB = 2000;

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Lower-case letters, digits and CJK only: "Chibi Head4 (2)" and "chibi head 4 (2)" match. */
export function matchKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** "2026-10-01", "1/10/2026" (day first, Thai style) or "1/10/2569" (Buddhist year), as Bangkok midnight. */
export function parseSheetDate(value: string): Date | null {
  const v = value.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  if (y > 2400) y -= 543;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  // 31/02 would roll into March: the Bangkok calendar day must be the one typed.
  const back = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return back.getUTCFullYear() === y && back.getUTCMonth() + 1 === m && back.getUTCDate() === d ? date : null;
}

const findCol = (header: string[], ...needles: string[]) => header.findIndex((h) => needles.some((n) => h.includes(n)));

/**
 * Rows of one tab. The header is the first row naming the English-name column (Google may merge
 * two header rows into one cell, e.g. "ชื่ออังกฤษ ชื่ออังกฤษ"); repeated header rows and rows
 * without a name or a valid price are skipped.
 */
export function parseCostTab(tab: string, csv: string): { rows: CostRow[]; skipped: number } {
  const table = parseCsv(csv);
  const headerAt = table.findIndex((r) => r.some((c) => c.includes("ชื่ออังกฤษ")));
  if (headerAt === -1) return { rows: [], skipped: 0 };
  const header = table[headerAt];
  const colEN = findCol(header, "ชื่ออังกฤษ");
  const colZH = findCol(header, "ชื่อจีน");
  const colPrice = findCol(header, "ราคา");
  const colStart = findCol(header, "เริ่มโปร", "เริ่ม");
  const colEnd = findCol(header, "สิ้นสุดโปร", "สิ้นสุด", "หมดโปร");
  if (colEN === -1 || colPrice === -1) return { rows: [], skipped: 0 };

  const rows: CostRow[] = [];
  let skipped = 0;
  for (const r of table.slice(headerAt + 1)) {
    if (rows.length >= MAX_ROWS_PER_TAB) break;
    const rawEN = (r[colEN] ?? "").trim();
    const rawZH = colZH === -1 ? "" : (r[colZH] ?? "").trim();
    const price = (r[colPrice] ?? "").trim().replace(/,/g, "");
    if (!rawEN && !rawZH) continue;
    if (rawEN.includes("ชื่ออังกฤษ")) continue; // repeated header
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(price)) {
      skipped++;
      continue;
    }
    const isPromo = PROMO_SUFFIX.test(rawEN) || PROMO_SUFFIX.test(rawZH);
    const nameEN = rawEN.replace(PROMO_SUFFIX, "");
    const nameZH = rawZH.replace(PROMO_SUFFIX, "");
    rows.push({
      tab,
      nameEN,
      nameZH,
      matchEN: matchKey(nameEN),
      matchZH: matchKey(nameZH),
      costYuan: price,
      isPromo,
      promoStartAt: colStart === -1 ? null : parseSheetDate(r[colStart] ?? ""),
      promoEndAt: colEnd === -1 ? null : parseSheetDate(r[colEnd] ?? ""),
    });
  }
  return { rows, skipped };
}

type RefLike = Pick<CostRow, "matchEN" | "matchZH" | "isPromo" | "promoStartAt" | "promoEndAt"> & {
  costYuan: string | { toString(): string };
};

const yuan = (r: { costYuan: string | { toString(): string } }) => Number(r.costYuan.toString());

/**
 * The cost row for a product (by its English or Thai name) from its folder's tab.
 * - Sold at full price: the normal row (if a name is listed twice, the higher price).
 * - Sold at a discount (`discounted`): the "(ราคาพิเศษ)" row — if it has promo dates, only when `at`
 *   falls inside them (end day inclusive) — else the lower of two same-name rows, else the normal row.
 */
export function pickCost<T extends RefLike>(refs: T[], productNames: string[], at: Date, discounted = false): T | null {
  const keys = productNames.map(matchKey).filter(Boolean);
  const hits = refs.filter((r) => keys.some((k) => k === r.matchEN || (r.matchZH && k === r.matchZH)));
  const normal = hits.filter((r) => !r.isPromo).sort((a, b) => yuan(b) - yuan(a));
  if (!discounted) return normal[0] ?? null;

  const DAY = 24 * 60 * 60 * 1000;
  const promo = hits.find(
    (r) =>
      r.isPromo &&
      (!r.promoStartAt || at >= r.promoStartAt) &&
      (!r.promoEndAt || at.getTime() < r.promoEndAt.getTime() + DAY),
  );
  const lowerDuplicate = normal.length > 1 && yuan(normal[normal.length - 1]) < yuan(normal[0]) ? normal[normal.length - 1] : null;
  return promo ?? lowerDuplicate ?? normal[0] ?? null;
}

/** Satang cost from yuan × rate, rounded to the nearest satang. */
export function costSatang(costYuan: string | { toString(): string }, rate: string | { toString(): string }): number {
  return Math.round(Number(costYuan.toString()) * Number(rate.toString()) * 100);
}

/** A Google Sheet id from an id or a full sheet URL; null when it is neither. */
export function parseSheetId(input: string): string | null {
  const v = input.trim();
  const fromUrl = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(v);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(v) ? v : null;
}

/**
 * Tab name → gid from the sheet's public "htmlview" page. Fetching a tab by name is unsafe: Google
 * silently returns the first tab when the name does not exist.
 */
export function parseSheetTabs(html: string): Map<string, string> {
  const tabs = new Map<string, string>();
  const re = /items\.push\(\{name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*?gid=(\d+)/g;
  for (const m of html.matchAll(re)) tabs.set(decodeJsString(m[1]).trim(), m[2]);
  return tabs;
}

/** JavaScript string-literal escapes as Google writes them (\x3d, &, \/, \"). */
function decodeJsString(s: string): string {
  return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)/g, (_, e: string) =>
    e.length > 1 ? String.fromCharCode(Number.parseInt(e.slice(1), 16)) : e,
  );
}

type Named = { nameEN: string; nameTH: string };

/**
 * Cost of one order line. A variant line uses the "<product> (<variant>)" row (e.g.
 * "Chibi Head2(1)"); without one it falls back to the product's own row (the client's sheet uses
 * that for the full set, e.g. "Chibi Head2" for "1+2+3").
 */
export function pickLineCost<T extends RefLike>(refs: T[], product: Named, variant: Named | null, at: Date, discounted = false): T | null {
  if (variant) {
    const specific = pickCost(refs, [`${product.nameEN} (${variant.nameEN})`, `${product.nameTH} (${variant.nameTH})`], at, discounted);
    if (specific) return specific;
  }
  return pickCost(refs, [product.nameEN, product.nameTH], at, discounted);
}

/**
 * Names listed with MORE than two different prices in a tab (non-promo): ambiguous, the sheet should
 * be fixed. Two prices are fine — normal and discount cost.
 */
export function conflictingRows(rows: Pick<CostRow, "tab" | "nameEN" | "matchEN" | "costYuan" | "isPromo">[]): string[] {
  const prices = new Map<string, Set<string>>();
  const label = new Map<string, string>();
  for (const r of rows) {
    if (r.isPromo || !r.matchEN) continue;
    const key = `${r.tab}\u0000${r.matchEN}`;
    if (!prices.has(key)) prices.set(key, new Set());
    prices.get(key)!.add(String(Number(r.costYuan)));
    label.set(key, `${r.tab} › ${r.nameEN}`);
  }
  return [...prices].filter(([, p]) => p.size > 2).map(([k, p]) => `${label.get(k)} (${[...p].join(" / ")} ¥)`);
}
