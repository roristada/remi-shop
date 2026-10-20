// Seasonal storefront dressing (colours, decorations, favicon). Decoration only: nothing here
// changes prices or what can be bought. Server time decides, so every visitor sees the same theme.

export type Season = "halloween";

type SeasonWindow = { season: Season; startsAt: Date; endsAt: Date };

/** Start inclusive, end exclusive, in Thai time. Add next year's dates (or another season) here. */
export const SEASON_WINDOWS: readonly SeasonWindow[] = [
  { season: "halloween", startsAt: new Date("2026-10-20T00:00:00+07:00"), endsAt: new Date("2026-11-01T00:00:00+07:00") },
];

export function activeSeason(now: Date = new Date()): Season | null {
  const t = now.getTime();
  return SEASON_WINDOWS.find((w) => t >= w.startsAt.getTime() && t < w.endsAt.getTime())?.season ?? null;
}
