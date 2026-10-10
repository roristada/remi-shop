export type BannerState = "LIVE" | "SCHEDULED" | "ENDED" | "OFF";

/** Same rule as `listLiveBanners`: switched on, started (or no start) and not yet ended. */
export function bannerState(b: { isActive: boolean; startAt: Date | null; endAt: Date | null }, now: Date): BannerState {
  if (!b.isActive) return "OFF";
  if (b.endAt && b.endAt <= now) return "ENDED";
  if (b.startAt && b.startAt > now) return "SCHEDULED";
  return "LIVE";
}

export const BANNER_STATE_LABEL_TH: Record<BannerState, string> = {
  LIVE: "แสดงอยู่",
  SCHEDULED: "ตั้งเวลาไว้",
  ENDED: "หมดเวลาแล้ว",
  OFF: "ปิดอยู่",
};

export const BANNER_THEME_LABEL_TH = {
  PINK: "ชมพู",
  LILAC: "ม่วงไลแลค",
  SKY: "ฟ้า",
  BUTTER: "เหลืองครีม",
  MINT: "เขียวมินต์",
} as const;
