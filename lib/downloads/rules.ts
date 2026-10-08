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

/**
 * Whether a buyer may get a file. `ownedVariants` holds the variant of each completed line the
 * buyer has for the product (null for a line bought without a variant). A shared file
 * (`fileVariantId` null) goes to every buyer; a variant file only to buyers of that variant.
 */
export function canAccessFile(fileVariantId: string | null, ownedVariants: ReadonlySet<string | null>): boolean {
  if (ownedVariants.size === 0) return false;
  return fileVariantId === null || ownedVariants.has(fileVariantId);
}

/**
 * Whether a line (product, or one variant of it) has a file in the latest version. Without one the
 * store delivers it by email. Mirrors lineWithoutFilesWhere in lib/products/delivery.ts.
 */
export function lineHasFiles(latestFiles: readonly { variantId: string | null }[], variantId: string | null): boolean {
  return latestFiles.some((f) => canAccessFile(f.variantId, new Set([variantId])));
}

/**
 * Files "download all" fetches for one owned line or product: the latest version's files that
 * still have downloads left. Convenience only; the download route re-authorizes each file.
 */
export function bulkDownloadFileIds(
  versions: { isLatest: boolean; files: { id: string; downloadCount: number }[] }[],
  downloadLimit: number | null,
): string[] {
  const version = versions.find((v) => v.isLatest) ?? versions[0];
  if (!version) return [];
  return version.files.filter((f) => !isDownloadLimitReached(downloadLimit, f.downloadCount)).map((f) => f.id);
}
