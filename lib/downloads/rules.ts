/** A repeat click within this window re-issues the same download without counting again. */
export const DOWNLOAD_RATE_LIMIT_SECONDS = 10;

/** `downloadLimit === null` means unlimited (never blocked). */
export function isDownloadLimitReached(downloadLimit: number | null, downloadCount: number): boolean {
  return downloadLimit !== null && downloadCount >= downloadLimit;
}

export function isWithinRateLimit(lastDownloadedAt: Date | null, now: Date): boolean {
  if (!lastDownloadedAt) return false;
  return now.getTime() - lastDownloadedAt.getTime() < DOWNLOAD_RATE_LIMIT_SECONDS * 1000;
}
