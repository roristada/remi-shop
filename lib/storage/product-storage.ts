import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKETS, maxUploadSize, SIGNED_URL_TTL_SECONDS, type BucketName } from "@/lib/storage/buckets";
import { sanitizeFileName } from "@/lib/storage/paths";
import { previewsOnR2 } from "@/lib/storage/public-url";
import { createR2Upload, r2ObjectInfo, r2ReadHead, r2Remove } from "@/lib/storage/r2";
import {
  checkFileSignature,
  getExtension,
  SIGNATURE_BYTES,
  type FileTypeError,
  DIGITAL_FILE_TYPES,
  IMAGE_FILE_TYPES,
  PRODUCT_IMAGE_FILE_TYPES,
} from "@/lib/storage/file-types";

// Object keys are generated here, never taken from the browser.
//   product-previews: products/{productId}/{uuid}.{ext}
//   digital-files:    products/{productId}/{versionId}/{uuid}-{safe-name}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function newProductImagePath(productId: string, fileName: string): string {
  return `products/${productId}/${crypto.randomUUID()}.${getExtension(fileName)}`;
}

/** An option's own picture: products/{productId}/variants/{uuid}.{ext}. */
export function newVariantImagePath(productId: string, fileName: string): string {
  return `products/${productId}/variants/${crypto.randomUUID()}.${getExtension(fileName)}`;
}

export function isVariantImagePath(path: string, productId: string): boolean {
  return new RegExp(`^products/${productId}/variants/${UUID}\\.(jpe?g|png|webp|gif)$`).test(path);
}

export function newProductFilePath(productId: string, versionId: string, fileName: string): string {
  return `products/${productId}/${versionId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

export function isProductImagePath(path: string, productId: string): boolean {
  return new RegExp(`^products/${productId}/${UUID}\\.(jpe?g|png|webp|gif)$`).test(path);
}

export function isProductFilePath(path: string, productId: string, versionId: string): boolean {
  return new RegExp(`^products/${productId}/${versionId}/${UUID}-[A-Za-z0-9._-]+$`).test(path);
}

/**
 * Where the browser sends the bytes: a Supabase one-time upload token, or (preview images on R2)
 * a presigned PUT URL with the headers it was signed with.
 */
export type SignedUpload =
  | { bucket: BucketName; path: string; token: string }
  | { bucket: BucketName; path: string; url: string; headers: Record<string, string> };

/** True when `bucket` is served from R2 rather than Supabase Storage. */
function onR2(bucket: BucketName): boolean {
  return bucket === BUCKETS.productPreviews && previewsOnR2();
}

/** One-time upload target; the browser uploads directly to storage (bypasses the 4.5 MB function body limit). */
export async function createSignedUpload(bucket: BucketName, path: string): Promise<SignedUpload | null> {
  if (onR2(bucket)) {
    try {
      return { bucket, path, ...(await createR2Upload(path)) };
    } catch (e) {
      console.error("[storage] r2 upload url failed", { bucket, path, message: (e as Error).message });
      return null;
    }
  }
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[storage] signed upload url failed", { bucket, path, message: error?.message });
    return null;
  }
  return { bucket, path: data.path, token: data.token };
}

export type VerifiedObject = { size: number };

/**
 * Verifies an uploaded object's real size and leading bytes. Deletes it when invalid,
 * so a rejected upload never lingers in the bucket.
 */
export async function verifyUploadedObject(
  bucket: BucketName,
  path: string,
  fileName: string,
): Promise<{ ok: true; object: VerifiedObject } | { ok: false; error: FileTypeError | "not_found" }> {
  const rules =
    bucket === BUCKETS.digitalFiles
      ? DIGITAL_FILE_TYPES
      : bucket === BUCKETS.productPreviews
        ? PRODUCT_IMAGE_FILE_TYPES
        : IMAGE_FILE_TYPES;

  // Both requests at once; the leading bytes are only judged once the size is known to be fine.
  const [info, head] = await Promise.all([objectInfo(bucket, path), readHead(bucket, path)]);
  if (info === null) return { ok: false, error: "not_found" };
  const { size } = info;

  let error: FileTypeError | null = null;
  if (!info.typeMatches) error = "signature_mismatch";
  else if (size <= 0) error = "empty";
  else if (size > maxUploadSize(bucket)) error = "too_large";
  else error = head ? checkFileSignature(rules, fileName, head) : "signature_mismatch";

  if (error) {
    await removeObjects(bucket, [path]);
    return { ok: false, error };
  }
  return { ok: true, object: { size } };
}

/** Size, and (R2 only) whether the stored content type matches the key; Supabase sets it itself. */
async function objectInfo(bucket: BucketName, path: string): Promise<{ size: number; typeMatches: boolean } | null> {
  if (onR2(bucket)) return r2ObjectInfo(path).catch(() => null);
  const { data, error } = await createAdminClient().storage.from(bucket).info(path);
  return error || !data ? null : { size: data.size ?? 0, typeMatches: true };
}

async function readHead(bucket: BucketName, path: string): Promise<Uint8Array | null> {
  if (onR2(bucket)) return r2ReadHead(path, SIGNATURE_BYTES).catch(() => null);
  const { data } = await createAdminClient().storage.from(bucket).createSignedUrl(path, 60);
  if (!data) return null;
  try {
    const res = await fetch(data.signedUrl, {
      headers: { Range: `bytes=0-${SIGNATURE_BYTES - 1}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer()).slice(0, SIGNATURE_BYTES);
  } catch (e) {
    console.error("[storage] read head failed", { bucket, path, message: (e as Error).message });
    return null;
  }
}

/**
 * Short-lived URL that makes Storage answer with `Content-Disposition: attachment`, so the
 * browser saves the file under its original name instead of previewing it inline.
 *
 * `download` is appended here rather than passed as an option: storage-js runs the query
 * through `encodeURI` after `URLSearchParams`, double-encoding non-ASCII names, so customers
 * received files literally named `%E5%A4%9A...psd` (and iOS Safari left them as `.download`).
 */
export async function createSignedDownloadUrl(
  bucket: BucketName,
  path: string,
  fileName: string,
  ttlSeconds = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrl(path, ttlSeconds);
  if (error || !data) {
    console.error("[storage] signed download url failed", { bucket, message: error?.message });
    return null;
  }
  return `${data.signedUrl}&download=${encodeURIComponent(fileName)}`;
}

/** Best-effort delete; failures are logged (orphans are harmless in a private bucket). */
export async function removeObjects(bucket: BucketName, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  if (onR2(bucket)) {
    const failed = await r2Remove(paths);
    if (failed.length > 0) console.error("[storage] remove failed", { bucket, count: failed.length });
    return;
  }
  const storage = createAdminClient().storage.from(bucket);
  // Storage API accepts up to 1000 keys per call.
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await storage.remove(paths.slice(i, i + 1000));
    if (error) console.error("[storage] remove failed", { bucket, count: paths.length, message: error.message });
  }
}
