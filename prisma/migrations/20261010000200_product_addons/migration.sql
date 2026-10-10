-- UAT round 3: optional add-on products offered on a product page. Additive only.
-- Add-ons are sold at their own normal price; nothing here changes pricing.

-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "added_with_product_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "addons_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "product_addons" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "addon_product_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_addons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_addons_addon_product_id_idx" ON "product_addons"("addon_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_addons_product_id_addon_product_id_key" ON "product_addons"("product_id", "addon_product_id");

-- AddForeignKey
ALTER TABLE "product_addons" ADD CONSTRAINT "product_addons_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_addons" ADD CONSTRAINT "product_addons_addon_product_id_fkey" FOREIGN KEY ("addon_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "product_addons" ADD CONSTRAINT "product_addons_not_self" CHECK ("product_id" <> "addon_product_id");

-- Server-only table (Prisma); no Data API access.
ALTER TABLE "product_addons" ENABLE ROW LEVEL SECURITY;
