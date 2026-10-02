import { publicEnv } from "@/lib/env";
import { BUCKETS } from "@/lib/storage/buckets";

/**
 * URL of a product picture at the size the spot needs: `card` for grids and lists, `detail` for the
 * product page. Falls back to the original until its optimized WebP copy exists.
 */
export function previewImageSrc(
  image: { imagePath: string; cardPath?: string | null; detailPath?: string | null },
  size: "card" | "detail" | "original" = "card",
): string {
  const path = size === "card" ? image.cardPath : size === "detail" ? image.detailPath : null;
  return previewImageUrl(path ?? image.imagePath);
}

/** Public URL for an object in the public `product-previews` bucket. Never use for private buckets. */
export function previewImageUrl(path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKETS.productPreviews}/${encoded}`;
}
