import sharp from "sharp";

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
  // The pixel limit counts every frame of an animation; uploads are admin-only and capped at 50 MB.
  return sharp(input, { animated: true, limitInputPixels: 2_000_000_000 })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();
}

/**
 * Path to serve at `size`: the new WebP copy, or the original when the copy would not be smaller
 * (small GIFs can grow as animated WebP). `copy` is the encoded copy's size in bytes.
 */
export function pickServedPath(original: { path: string; bytes: number }, copy: { path: string; bytes: number }): string {
  return copy.bytes < original.bytes ? copy.path : original.path;
}

/**
 * Whether a copy at `size` is worth encoding. An animation already within the size's width is
 * served as uploaded: re-encoding every frame costs far more server time (it can exceed the
 * hosting function's limit) than the few bytes it saves.
 */
export function worthEncoding(image: { width: number; frames: number }, size: PreviewSize): boolean {
  return image.frames <= 1 || image.width > SIZES[size].width;
}
