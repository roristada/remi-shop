import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIGNED_URL_TTL_SECONDS, type BucketName } from "@/lib/storage/buckets";
import { getExtension } from "@/lib/storage/file-types";

// Object keys are generated here, never taken from the browser.
//   payment-slips (private): {yyyy}/{mm}/{orderId}/{uuid}.{ext}
//   license-artworks (private): {userId}/{uuid}.{ext}
//   product-previews (public): settings/promptpay-qr/{uuid}.{ext}  (the QR is not secret)

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function newSlipPath(orderId: string, fileName: string, now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${orderId}/${crypto.randomUUID()}.${getExtension(fileName)}`;
}

export function isSlipPath(path: string, orderId: string): boolean {
  return new RegExp(`^\\d{4}/\\d{2}/${orderId}/${UUID}\\.(jpe?g|png|webp)$`).test(path);
}

// license-artworks (private): {userId}/{uuid}.{ext}. Uploaded before the request exists,
// so the key is scoped to the customer and checked against them on submit.
export function newArtworkPath(userId: string, fileName: string): string {
  return `${userId}/${crypto.randomUUID()}.${getExtension(fileName)}`;
}

export function isArtworkPath(path: string, userId: string): boolean {
  return new RegExp(`^${userId}/${UUID}\\.(jpe?g|png|webp)$`).test(path);
}

export function newQrImagePath(fileName: string): string {
  return `settings/promptpay-qr/${crypto.randomUUID()}.${getExtension(fileName)}`;
}

export function isQrImagePath(path: string): boolean {
  return new RegExp(`^settings/promptpay-qr/${UUID}\\.(jpe?g|png|webp)$`).test(path);
}

/** Short-lived view URLs for objects in a private bucket (e.g. slips for the reviewer). */
export async function createSignedViewUrls(
  bucket: BucketName,
  paths: string[],
  ttlSeconds = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrls(paths, ttlSeconds);
  if (error || !data) {
    console.error("[storage] signed view urls failed", { bucket, count: paths.length, message: error?.message });
    return out;
  }
  for (const item of data) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}
