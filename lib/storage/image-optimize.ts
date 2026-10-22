import "server-only";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKETS } from "@/lib/storage/buckets";
import { previewsOnR2 } from "@/lib/storage/public-url";
import { r2Download, r2Upload } from "@/lib/storage/r2";
import {
  fitsDecodeBudget,
  optimizedPath,
  pickServedPath,
  toWebp,
  worthEncoding,
  type PreviewSize,
} from "@/lib/storage/webp";
import { createSerialQueue } from "@/lib/storage/serial-queue";

export { previewObjectPaths, type PreviewSize } from "@/lib/storage/webp";

// One long-running server (not one function per request): a long GIF can take hundreds of MB once
// decoded, so jobs run one at a time and libvips keeps no cache between them.
sharp.concurrency(1);
sharp.cache(false);
const runExclusive = createSerialQueue();

/**
 * Builds the requested WebP copies of a stored preview image and uploads them next to it.
 * Returns the path to serve for each size (the original where a copy is not worth it), or null
 * when the image could not be processed (callers then keep serving the original).
 *
 * Slow for long animations, so it never runs inside a save: see app/api/admin/images/optimize.
 * Jobs are queued: one runs at a time per server.
 */
export function optimizePreviewImage(
  path: string,
  sizes: PreviewSize[] = ["card", "detail"],
): Promise<Partial<Record<PreviewSize, string>> | null> {
  return runExclusive(() => optimizeNow(path, sizes));
}

async function optimizeNow(
  path: string,
  sizes: PreviewSize[],
): Promise<Partial<Record<PreviewSize, string>> | null> {
  try {
    const original = await downloadPreview(path);
    const meta = await sharp(original, { animated: true, limitInputPixels: 2_000_000_000 }).metadata();
    if (!fitsDecodeBudget({ width: meta.width ?? 0, height: meta.height ?? 0 })) {
      console.warn("[storage] image too large to optimize; serving the original", {
        path,
        width: meta.width,
        height: meta.height,
        frames: meta.pages,
      });
      return null;
    }
    const image = { width: meta.width ?? 0, frames: meta.pages ?? 1 };

    const out: Partial<Record<PreviewSize, string>> = {};
    for (const size of sizes) {
      if (!worthEncoding(image, size)) {
        out[size] = path;
        continue;
      }
      const target = optimizedPath(path, size);
      const body = await toWebp(original, size);
      const served = pickServedPath({ path, bytes: original.length }, { path: target, bytes: body.length });
      if (served === target) {
        await uploadPreview(target, body);
      }
      out[size] = served;
    }
    return out;
  } catch (error) {
    console.error("[storage] image optimize failed", { path, message: (error as Error).message });    return null;
  }
}

async function downloadPreview(path: string): Promise<Buffer> {
  if (previewsOnR2()) return r2Download(path);
  const { data, error } = await createAdminClient().storage.from(BUCKETS.productPreviews).download(path);
  if (error || !data) throw new Error(error?.message ?? "download failed");
  return Buffer.from(await data.arrayBuffer());
}

async function uploadPreview(path: string, body: Buffer): Promise<void> {
  if (previewsOnR2()) return r2Upload(path, body, "image/webp");
  const { error } = await createAdminClient()
    .storage.from(BUCKETS.productPreviews)
    .upload(path, body, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
  if (error) throw new Error(error.message);
}
