import { getExtension } from "@/lib/storage/file-types";

// product-previews (public): giveaways/{giveawayId}/{uuid}.{ext} — giveaway art is public anyway.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function newGiveawayImagePath(giveawayId: string, fileName: string): string {
  return `giveaways/${giveawayId}/${crypto.randomUUID()}.${getExtension(fileName)}`;
}

/** Only a key issued for this very giveaway can be attached to it. */
export function isGiveawayImagePath(giveawayId: string, path: string): boolean {
  return new RegExp(`^giveaways/${giveawayId}/${UUID}\\.(jpe?g|png|webp)$`).test(path);
}
