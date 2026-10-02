import "server-only";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKETS } from "@/lib/storage/buckets";

/**
 * Optimized WebP copies of a preview image. Animated GIF/WebP stay animated (every frame is
 * resized), so product cards keep moving while downloading far less than the original.
 *   card   — product cards and lists (≤ 640 px wide)
 *   detail — the product page gallery (≤ 1600 px wide)
 * The original is kept for the full-size view.
 */
export type PreviewSize = "card" | "detail";

const SIZES: Record<PreviewSize, { width: number; quality: number }> = {
  card: { width: 640, quality: 78 },
  detail: { width: 1600, quality: 82 },
};

/** `products/x/abc.gif` → `products/x/abc.card.webp`. */
export function optimizedPath(path: string, size: PreviewSize): string {
  return `${path.replace(/\.[^./]+$/, "")}.${size}.webp`;
}

/** Every stored object of a preview image: the original and its optimized copies. */
export function previewObjectPaths(image: { imagePath: string; cardPath: string | null; detailPath: string | null }): string[] {
  return [image.imagePath, image.cardPath, image.detailPath].filter((p): p is string => p !== null);
}

/** Re-encodes one image to WebP at most `width` wide, keeping every animation frame. */
export async function toWebp(input: Buffer, size: PreviewSize): Promise<Buffer> {
  const { width, quality } = SIZES[size];
  return sharp(input, { animated: true, limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();
}

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
      const { error: uploadError } = await storage.upload(target, body, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: true,
      });
      if (uploadError) throw new Error(uploadError.message);
      out[size] = target;
    }
    return out;
  } catch (error) {
    console.error("[storage] image optimize failed", { path, message: (error as Error).message });
    return null;
  }
}
