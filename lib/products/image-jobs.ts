import "server-only";
import { prisma } from "@/lib/prisma/client";
import { BUCKETS } from "@/lib/storage/buckets";
import { removeObjects } from "@/lib/storage/product-storage";
import { optimizePreviewImage } from "@/lib/storage/image-optimize";
import { revalidateCatalog } from "@/lib/products/revalidate";

// Optimizing runs after the save, one request per picture, so a long animation can never time
// out the save itself. Until it finishes (or if it fails) the original picture is shown.

export async function optimizeProductImage(imageId: string): Promise<void> {
  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
    select: { id: true, imagePath: true, cardPath: true, detailPath: true },
  });
  if (!image || (image.cardPath && image.detailPath)) return;
  const optimized = await optimizePreviewImage(image.imagePath);
  if (!optimized) return;
  // The picture may have been removed meanwhile; then there is nothing to update.
  await prisma.productImage.updateMany({
    where: { id: image.id, imagePath: image.imagePath },
    data: { cardPath: optimized.card ?? null, detailPath: optimized.detail ?? null },
  });
  revalidateCatalog();
}

/** An option picture keeps only a card-size copy, which then replaces the upload. */
export async function optimizeVariantImage(variantId: string): Promise<void> {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { id: true, imagePath: true } });
  if (!variant?.imagePath || variant.imagePath.endsWith(".card.webp")) return;
  const optimized = await optimizePreviewImage(variant.imagePath, ["card"]);
  const card = optimized?.card;
  if (!card || card === variant.imagePath) return;
  const { count } = await prisma.productVariant.updateMany({
    where: { id: variant.id, imagePath: variant.imagePath },
    data: { imagePath: card },
  });
  // Changed meanwhile (new picture or removed): the new copy is the orphan, not the upload.
  await removeObjects(BUCKETS.productPreviews, [count === 1 ? variant.imagePath : card]);
  revalidateCatalog();
}
