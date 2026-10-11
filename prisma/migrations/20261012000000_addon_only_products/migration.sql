-- Add-on-only products: shown in the shop but bought only with a product that offers them,
-- and which main product each order line was bought as an add-on of.


-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "added_with_product_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "addon_only" BOOLEAN NOT NULL DEFAULT false;

