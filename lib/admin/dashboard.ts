// Pure date helpers for the admin dashboard. Business days are Bangkok calendar days (UTC+7, no DST).

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Bangkok calendar date "YYYY-MM-DD" of an instant. */
export function bangkokDayKey(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 Bangkok time of the day `date` falls on, as a UTC instant. */
export function startOfBangkokDay(date: Date): Date {
  return new Date(`${bangkokDayKey(date)}T00:00:00+07:00`);
}

/** 00:00 Bangkok time on the 1st of the month `date` falls on. */
export function startOfBangkokMonth(date: Date): Date {
  return new Date(`${bangkokDayKey(date).slice(0, 7)}-01T00:00:00+07:00`);
}

/** 00:00 Bangkok time on the 1st of the month before the one `date` falls on. */
export function startOfPreviousBangkokMonth(date: Date): Date {
  const [y, m] = bangkokDayKey(date).slice(0, 7).split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return new Date(`${prevY}-${String(prevM).padStart(2, "0")}-01T00:00:00+07:00`);
}

/** The last `days` Bangkok dates, oldest first, ending with today. */
export function bangkokDayKeys(now: Date, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(bangkokDayKey(new Date(now.getTime() - i * DAY_MS)));
  return out;
}

export type YearMonth = { year: number; month: number };

/** `?month=YYYY-MM` from the URL, or the current Bangkok month. Months after this one are not allowed. */
export function parseMonthParam(value: unknown, now: Date): YearMonth {
  const [cy, cm] = bangkokDayKey(now).slice(0, 7).split("-").map(Number);
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (!match) return { year: cy, month: cm };
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year * 12 + month > cy * 12 + cm) return { year: cy, month: cm };
  return { year, month };
}

export const monthKey = ({ year, month }: YearMonth) => `${year}-${String(month).padStart(2, "0")}`;

/** [start, end) of a Bangkok calendar month as UTC instants. */
export function bangkokMonthRange({ year, month }: YearMonth): { since: Date; until: Date } {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    since: new Date(`${monthKey({ year, month })}-01T00:00:00+07:00`),
    until: new Date(`${monthKey(next)}-01T00:00:00+07:00`),
  };
}

/** Every Bangkok date "YYYY-MM-DD" of a month. */
export function monthDayKeys(ym: YearMonth): string[] {
  const days = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${monthKey(ym)}-${String(i + 1).padStart(2, "0")}`);
}
