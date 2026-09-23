import { publicEnv } from "@/lib/env";
import { BUCKETS } from "@/lib/storage/buckets";

/** Public URL for an object in the public `product-previews` bucket. Never use for private buckets. */
export function previewImageUrl(path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKETS.productPreviews}/${encoded}`;
}
