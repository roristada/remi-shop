import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKETS } from "@/lib/storage/buckets";
import { optimizedPath, pickServedPath, toWebp, type PreviewSize } from "@/lib/storage/webp";

export { previewObjectPaths, type PreviewSize } from "@/lib/storage/webp";

/**
 * Builds the requested WebP copies of a stored preview image and uploads them next to it.
 * Returns their paths, or null when the image could not be processed (callers then keep
 * serving the original, so a failure here never loses an upload).
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

    const out: Partial<Record<PreviewSize, string>> = {};
    for (const size of sizes) {
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
