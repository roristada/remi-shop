import { getExtension } from "@/lib/storage/file-types";

// product-previews (public): banners/{bannerId}/{uuid}.{ext} — banner art is public anyway.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function newBannerImagePath(bannerId: string, fileName: string): string {
  return `banners/${bannerId}/${crypto.randomUUID()}.${getExtension(fileName)}`;
}

/** Only a key issued for this very banner can be attached to it. */
export function isBannerImagePath(bannerId: string, path: string): boolean {
  return new RegExp(`^banners/${bannerId}/${UUID}\\.(jpe?g|png|webp)$`).test(path);
}
