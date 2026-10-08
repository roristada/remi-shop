import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Products and order lines the store delivers by email: nothing in the latest version for them yet.
 * Same rule as lineHasFiles (lib/downloads/rules.ts), as Prisma filters.
 */

/** The latest version has no shared file (one every buyer gets). */
const noSharedFile = { versions: { none: { isLatest: true, files: { some: { variantId: null } } } } } satisfies Prisma.ProductWhereInput;

/** No file of the latest version belongs to this variant. */
const variantWithoutFile = { files: { none: { version: { isLatest: true } } } } satisfies Prisma.ProductVariantWhereInput;

/** An order line that has no file to download right now. */
export function lineWithoutFilesWhere(): Prisma.OrderItemWhereInput {
  return {
    product: noSharedFile,
    OR: [{ variantId: null }, { variant: variantWithoutFile }],
  };
}

/** A product where at least one buyable line (the product itself, or an active variant) has no file. */
export function productNeedsEmailWhere(): Prisma.ProductWhereInput {
  return {
    ...noSharedFile,
    OR: [{ variants: { none: {} } }, { variants: { some: { isActive: true, ...variantWithoutFile } } }],
  };
}
