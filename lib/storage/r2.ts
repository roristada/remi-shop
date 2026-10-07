import "server-only";
import { AwsClient } from "aws4fetch";
import { serverEnv } from "@/lib/env.server";
import { DIGITAL_FILE_TYPES, mimeFor } from "@/lib/storage/file-types";
import { attachmentDisposition } from "@/lib/storage/paths";

/**
 * Cloudflare R2 (S3 API): no egress fees, so this traffic no longer counts against the Supabase
 * egress quota. Two buckets:
 *   previews: the public `product-previews` images, served by cloudflare/preview-worker.js
 *   files:    the private `digital-files`, only reachable through short-lived presigned GETs
 * Payment slips and license artwork stay in Supabase Storage.
 */
export type R2Store = "previews" | "files";

/** Browsers cache preview objects for a year; keys are never reused (each upload gets a new uuid). */
export const PREVIEW_CACHE_CONTROL = "public, max-age=31536000, immutable";
// Purchased files must never sit in a shared cache.
const FILE_CACHE_CONTROL = "private, no-store";

// Short: the URL stays usable until it expires, even after the upload was verified. The preview
// Worker serves by extension (cloudflare/preview-worker.js), so a re-upload can't change the type.
const UPLOAD_URL_TTL_SECONDS = 2 * 60;

let aws: AwsClient | undefined;

/** Whether digital files live in R2 (R2_FILES_BUCKET set) instead of Supabase Storage. */
export function filesOnR2(): boolean {
  return Boolean(serverEnv().R2_FILES_BUCKET);
}

function client(): AwsClient {
  if (aws) return aws;
  const env = serverEnv();
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) throw new Error("R2 is not configured");
  aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
  return aws;
}

function objectUrl(store: R2Store, key: string): string {
  const env = serverEnv();
  const bucket = store === "previews" ? env.R2_BUCKET : env.R2_FILES_BUCKET;
  if (!env.R2_ACCOUNT_ID || !bucket) throw new Error("R2 is not configured");
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

const PREVIEW_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** The content type an object must be stored with, from its key (never from the browser). */
function contentTypeFor(store: R2Store, key: string): string {
  if (store === "files") return mimeFor(DIGITAL_FILE_TYPES, key);
  const type = PREVIEW_TYPES[key.split(".").pop()?.toLowerCase() ?? ""];
  if (!type) throw new Error("Unsupported preview image type");
  return type;
}

/**
 * Presigned PUT the browser uploads to directly, with the headers it must send. `cache-control` is
 * signed; `content-type` cannot be (S3 presigning leaves it out), so the browser could still send
 * another type: `r2ObjectInfo` reports a mismatch and `verifyUploadedObject` deletes the object.
 */
export async function createR2Upload(
  store: R2Store,
  key: string,
): Promise<{ url: string; headers: Record<string, string> }> {
  const headers = {
    "cache-control": store === "previews" ? PREVIEW_CACHE_CONTROL : FILE_CACHE_CONTROL,
    "content-type": contentTypeFor(store, key),
  };
  const url = new URL(objectUrl(store, key));
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_URL_TTL_SECONDS));
  const signed = await client().sign(url.toString(), { method: "PUT", headers, aws: { signQuery: true } });
  return { url: signed.url, headers };
}

/**
 * Short-lived presigned GET for a digital file. R2 answers with `Content-Disposition: attachment`
 * and the original name, so the browser saves the file instead of opening it.
 */
export async function createR2DownloadUrl(key: string, fileName: string, ttlSeconds: number): Promise<string> {
  const url = new URL(objectUrl("files", key));
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
  url.searchParams.set("response-content-disposition", attachmentDisposition(fileName));
  const signed = await client().sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

/** Size in bytes and whether the stored type is the one its key calls for; null when missing. */
export async function r2ObjectInfo(store: R2Store, key: string): Promise<{ size: number; typeMatches: boolean } | null> {
  const res = await client().fetch(objectUrl(store, key), { method: "HEAD" });
  if (!res.ok) return null;
  const stored = (res.headers.get("content-type") ?? "").toLowerCase().split(";")[0].trim();
  let expected: string | null;
  try {
    expected = contentTypeFor(store, key);
  } catch {
    expected = null;
  }
  return { size: Number(res.headers.get("content-length") ?? 0), typeMatches: expected === stored };
}

/** The first `bytes` bytes of an object, or null. */
export async function r2ReadHead(store: R2Store, key: string, bytes: number): Promise<Uint8Array | null> {
  const res = await client().fetch(objectUrl(store, key), { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer()).slice(0, bytes);
}

export async function r2Download(key: string): Promise<Buffer> {
  const res = await client().fetch(objectUrl("previews", key));
  if (!res.ok) throw new Error(`R2 download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function r2Upload(key: string, body: Buffer, contentType: string): Promise<void> {
  const res = await client().fetch(objectUrl("previews", key), {
    method: "PUT",
    headers: { "content-type": contentType, "cache-control": PREVIEW_CACHE_CONTROL },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);
}

/** Deletes objects; a missing key counts as deleted. Returns the keys that failed. */
export async function r2Remove(store: R2Store, keys: string[]): Promise<string[]> {
  const results = await Promise.all(
    keys.map(async (key) => {
      try {
        const res = await client().fetch(objectUrl(store, key), { method: "DELETE" });
        return res.ok || res.status === 404 ? null : key;
      } catch {
        return key;
      }
    }),
  );
  return results.filter((k): k is string => k !== null);
}
