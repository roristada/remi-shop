import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";

/** Data-cache tag on cached public catalog reads (see getShopProduct). */
export const CATALOG_CACHE_TAG = "catalog";
/** Upper bound on staleness for catalog changes that do not expire the tag. */
export const CATALOG_CACHE_SECONDS = 300;

/** Drops cached catalog data at once, so the next visitor reads fresh rows. */
export function expireCatalogCache() {
  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
}

/** Product/category changes affect admin lists and every storefront page that lists products. */
export function revalidateCatalog() {
  expireCatalogCache();
  revalidatePath("/", "layout");
}
