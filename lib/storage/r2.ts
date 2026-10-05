import "server-only";
import { AwsClient } from "aws4fetch";
import { serverEnv } from "@/lib/env.server";

/**
 * Cloudflare R2 (S3 API) for the public `product-previews` images: no egress fees, so storefront
 * picture traffic no longer counts against the Supabase egress quota. Private buckets (digital
 * files, slips, license artwork) stay in Supabase Storage.
 */

/** Browsers cache preview objects for a year; keys are never reused (each upload gets a new uuid). */
export const PREVIEW_CACHE_CONTROL = "public, max-age=31536000, immutable";

// Short: the URL stays usable until it expires, even after the upload was verified. The preview
// Worker serves by extension (cloudflare/preview-worker.js), so a re-upload can't change the type.
const UPLOAD_URL_TTL_SECONDS = 2 * 60;

let client: { aws: AwsClient; base: string } | undefined;

function r2() {
  if (client) return client;
  const env = serverEnv();
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) {
    throw new Error("R2 is not configured");
  }
  client = {
    aws: new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    }),
    base: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`,
  };
  return client;
}

const PREVIEW_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function previewContentType(key: string): string {
  const type = PREVIEW_TYPES[key.split(".").pop()?.toLowerCase() ?? ""];
  if (!type) throw new Error("Unsupported preview image type");
  return type;
}

function objectUrl(key: string): string {
  return `${r2().base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Presigned PUT the browser uploads to directly, with the headers it must send. `cache-control` is
 * signed; `content-type` cannot be (S3 presigning leaves it out), so the browser could still send
 * another type: `r2ObjectInfo` reports a mismatch and `verifyUploadedObject` deletes the object.
 */
export async function createR2Upload(key: string): Promise<{ url: string; headers: Record<string, string> }> {
  const headers = { "cache-control": PREVIEW_CACHE_CONTROL, "content-type": previewContentType(key) };
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_URL_TTL_SECONDS));
  const signed = await r2().aws.sign(url.toString(), { method: "PUT", headers, aws: { signQuery: true } });
  return { url: signed.url, headers };
}

/** Size in bytes and whether the stored type is the one its key calls for; null when missing. */
export async function r2ObjectInfo(key: string): Promise<{ size: number; typeMatches: boolean } | null> {
  const res = await r2().aws.fetch(objectUrl(key), { method: "HEAD" });
  if (!res.ok) return null;
  const stored = (res.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
  return {
    size: Number(res.headers.get("content-length") ?? 0),
    typeMatches: PREVIEW_TYPES[key.split(".").pop()?.toLowerCase() ?? ""] === stored,
  };
}

/** The first `bytes` bytes of an object, or null. */
export async function r2ReadHead(key: string, bytes: number): Promise<Uint8Array | null> {
  const res = await r2().aws.fetch(objectUrl(key), { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer()).slice(0, bytes);
}

export async function r2Download(key: string): Promise<Buffer> {
  const res = await r2().aws.fetch(objectUrl(key));
  if (!res.ok) throw new Error(`R2 download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function r2Upload(key: string, body: Buffer, contentType: string): Promise<void> {
  const res = await r2().aws.fetch(objectUrl(key), {
    method: "PUT",
    headers: { "content-type": contentType, "cache-control": PREVIEW_CACHE_CONTROL },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);
}

/** Deletes objects; a missing key counts as deleted. Returns the keys that failed. */
export async function r2Remove(keys: string[]): Promise<string[]> {
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await r2().aws.fetch(objectUrl(key), { method: "DELETE" });
        return res.ok || res.status === 404 ? null : key;
      } catch {
        return key;
      }
    }),
  );
  return results.filter((k): k is string => k !== null);
}
