import { getExtension } from "@/lib/storage/file-types";

// product-previews (public): categories/{categoryId}/{uuid}.{ext} — category icons are public anyway.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function newCategoryImagePath(categoryId: string, fileName: string): string {
  return `categories/${categoryId}/${crypto.randomUUID()}.${getExtension(fileName)}`;
}

/** Only a key issued for this very category can be attached to it. */
export function isCategoryImagePath(categoryId: string, path: string): boolean {
  return new RegExp(`^categories/${categoryId}/${UUID}\.(jpe?g|png|webp)$`).test(path);
}
