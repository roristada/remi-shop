import { bangkokDayKey, startOfBangkokMonth, startOfPreviousBangkokMonth } from "@/lib/admin/dashboard";

// Report periods for the profit page (pure). Days are Bangkok calendar days.

export const PERIOD_PRESETS = [
  { key: "month", label: "เดือนนี้" },
  { key: "last-month", label: "เดือนที่แล้ว" },
  { key: "30d", label: "30 วันล่าสุด" },
  { key: "year", label: "ปีนี้" },
] as const;

export type PeriodKey = (typeof PERIOD_PRESETS)[number]["key"] | "custom";
export type Period = { key: PeriodKey; from: Date; to: Date; fromKey: string; toKey: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const dayStart = (key: string) => new Date(`${key}T00:00:00+07:00`);
const dayEnd = (key: string) => new Date(`${key}T23:59:59.999+07:00`);

function preset(key: Exclude<PeriodKey, "custom">, now: Date): { from: Date; to: Date } {
  switch (key) {
    case "month":
      return { from: startOfBangkokMonth(now), to: now };
    case "last-month": {
      const from = startOfPreviousBangkokMonth(now);
      return { from, to: new Date(startOfBangkokMonth(now).getTime() - 1) };
    }
    case "30d":
      return { from: dayStart(bangkokDayKey(new Date(now.getTime() - 29 * DAY_MS))), to: now };
    case "year":
      return { from: dayStart(`${bangkokDayKey(now).slice(0, 4)}-01-01`), to: now };
  }
}

/**
 * `?period=month|last-month|30d|year`, or `?from=YYYY-MM-DD&to=YYYY-MM-DD` for a custom range
 * (either bound may be left out). Anything invalid falls back to this month.
 */
export function parsePeriod(sp: Record<string, string | string[] | undefined>, now: Date): Period {
  const fromRaw = one(sp.from);
  const toRaw = one(sp.to);
  const custom = (fromRaw && DATE.test(fromRaw)) || (toRaw && DATE.test(toRaw));
  if (custom) {
    let from = fromRaw && DATE.test(fromRaw) ? dayStart(fromRaw) : startOfBangkokMonth(now);
    let to = toRaw && DATE.test(toRaw) ? dayEnd(toRaw) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return parsePeriod({}, now);
    if (from > to) [from, to] = [dayStart(bangkokDayKey(to)), dayEnd(bangkokDayKey(from))];
    return { key: "custom", from, to, fromKey: bangkokDayKey(from), toKey: bangkokDayKey(to) };
  }
  const key = PERIOD_PRESETS.find((p) => p.key === one(sp.period))?.key ?? "month";
  const { from, to } = preset(key, now);
  return { key, from, to, fromKey: bangkokDayKey(from), toKey: bangkokDayKey(to) };
}

/** "1–10 ต.ค. 2026" / "28 ก.ย. – 10 ต.ค. 2026" / across years with both years. */
export function formatPeriod(from: Date, to: Date): string {
  const part = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("th-TH-u-ca-gregory", { timeZone: "Asia/Bangkok", ...opts }).format(d);
  const [fy, ty] = [part(from, { year: "numeric" }), part(to, { year: "numeric" })];
  const [fm, tm] = [part(from, { month: "short" }), part(to, { month: "short" })];
  const [fd, td] = [part(from, { day: "numeric" }), part(to, { day: "numeric" })];
  if (fy !== ty) return `${fd} ${fm} ${fy} – ${td} ${tm} ${ty}`;
  if (fm !== tm) return `${fd} ${fm} – ${td} ${tm} ${ty}`;
  return fd === td ? `${fd} ${fm} ${fy}` : `${fd}–${td} ${fm} ${fy}`;
}
