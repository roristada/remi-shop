import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKETS, MAX_FILE_SIZE, type BucketName } from "@/lib/storage/buckets";
import { sanitizeFileName } from "@/lib/storage/paths";
import {
  checkFileSignature,
  getExtension,
  SIGNATURE_BYTES,
  type FileTypeError,
  DIGITAL_FILE_TYPES,
  IMAGE_FILE_TYPES,
} from "@/lib/storage/file-types";

// Object keys are generated here, never taken from the browser.
//   product-previews: products/{productId}/{uuid}.{ext}
//   digital-files:    products/{productId}/{versionId}/{uuid}-{safe-name}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function newProductImagePath(productId: string, fileName: string): string {
  return `products/${productId}/${crypto.randomUUID()}.${getExtension(fileName)}`;
}

export function newProductFilePath(productId: string, versionId: string, fileName: string): string {
  return `products/${productId}/${versionId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

export function isProductImagePath(path: string, productId: string): boolean {
  return new RegExp(`^products/${productId}/${UUID}\\.(jpe?g|png|webp)$`).test(path);
}

export function isProductFilePath(path: string, productId: string, versionId: string): boolean {
  return new RegExp(`^products/${productId}/${versionId}/${UUID}-[A-Za-z0-9._-]+$`).test(path);
}

export type SignedUpload = { bucket: BucketName; path: string; token: string };

/** One-time upload token; the browser uploads directly to Storage (bypasses the 4.5 MB function body limit). */
export async function createSignedUpload(bucket: BucketName, path: string): Promise<SignedUpload | null> {
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
  const storage = createAdminClient().storage.from(bucket);
  const rules = bucket === BUCKETS.digitalFiles ? DIGITAL_FILE_TYPES : IMAGE_FILE_TYPES;

  const { data: info, error: infoError } = await storage.info(path);
  if (infoError || !info) return { ok: false, error: "not_found" };

  const size = info.size ?? 0;
  let error: FileTypeError | null = null;
  if (size <= 0) error = "empty";
  else if (size > MAX_FILE_SIZE) error = "too_large";
  else {
    const head = await readHead(bucket, path);
    error = head ? checkFileSignature(rules, fileName, head) : "signature_mismatch";
  }

  if (error) {
    await removeObjects(bucket, [path]);
    return { ok: false, error };
  }
  return { ok: true, object: { size } };
}

async function readHead(bucket: BucketName, path: string): Promise<Uint8Array | null> {
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

/** Best-effort delete; failures are logged (orphans are harmless in a private bucket). */
export async function removeObjects(bucket: BucketName, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const storage = createAdminClient().storage.from(bucket);
  // Storage API accepts up to 1000 keys per call.
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await storage.remove(paths.slice(i, i + 1000));
    if (error) console.error("[storage] remove failed", { bucket, count: paths.length, message: error.message });
  }
}
