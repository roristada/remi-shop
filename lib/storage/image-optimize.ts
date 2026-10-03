import "server-only";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKETS } from "@/lib/storage/buckets";
import { optimizedPath, pickServedPath, toWebp, worthEncoding, type PreviewSize } from "@/lib/storage/webp";

export { previewObjectPaths, type PreviewSize } from "@/lib/storage/webp";

/**
 * Builds the requested WebP copies of a stored preview image and uploads them next to it.
 * Returns the path to serve for each size (the original where a copy is not worth it), or null
 * when the image could not be processed (callers then keep serving the original).
 *
 * Slow for long animations, so it never runs inside a save: see app/api/admin/images/optimize.
 */
export async function optimizePreviewImage(
  path: string,
  sizes: PreviewSize[] = ["card", "detail"],
): Promise<Partial<Record<PreviewSize, string>> | null> {
  const storage = createAdminClient().storage.from(BUCKETS.productPreviews);
  try {
    const { data, error } = await storage.download(path);
    if (error || !data) throw new Error(error?.message ?? "download failed");
    const original = Buffer.from(await data.arrayBuffer());
    const meta = await sharp(original, { animated: true, limitInputPixels: 2_000_000_000 }).metadata();
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
        const { error: uploadError } = await storage.upload(target, body, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: true,
        });
        if (uploadError) throw new Error(uploadError.message);
      }
      out[size] = served;
    }
    return out;
  } catch (error) {
    console.error("[storage] image optimize failed", { path, message: (error as Error).message });
    return null;
  }
}
