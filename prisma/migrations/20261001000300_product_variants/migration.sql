-- DropIndex
DROP INDEX "cart_items_cart_id_product_id_key";

-- DropIndex
DROP INDEX "order_items_order_id_product_id_key";

-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "variant_id" UUID;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "variant_id" UUID,
ADD COLUMN     "variant_name_en_snapshot" TEXT,
ADD COLUMN     "variant_name_th_snapshot" TEXT;

-- AlterTable
ALTER TABLE "product_version_files" ADD COLUMN     "variant_id" UUID;

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "discount_percent" DECIMAL(5,2),
    "discount_start_at" TIMESTAMPTZ(6),
    "discount_end_at" TIMESTAMPTZ(6),
    "stock_limit" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_product_id_sort_order_idx" ON "product_variants"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");

-- CreateIndex
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX "product_version_files_variant_id_idx" ON "product_version_files"("variant_id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_version_files" ADD CONSTRAINT "product_version_files_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ──────────────── Hand-written: rules Prisma cannot express ────────────────

-- One cart/order line per (product, variant). Plain unique indexes treat NULL variant ids as
-- distinct, so products without variants and variant lines get one partial index each.
CREATE UNIQUE INDEX "cart_items_one_per_product" ON "cart_items"("cart_id", "product_id") WHERE "variant_id" IS NULL;
CREATE UNIQUE INDEX "cart_items_one_per_variant" ON "cart_items"("cart_id", "variant_id") WHERE "variant_id" IS NOT NULL;
CREATE UNIQUE INDEX "order_items_one_per_product" ON "order_items"("order_id", "product_id") WHERE "variant_id" IS NULL;
CREATE UNIQUE INDEX "order_items_one_per_variant" ON "order_items"("order_id", "variant_id") WHERE "variant_id" IS NOT NULL;

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_price_nonneg" CHECK ("price" >= 0),
  ADD CONSTRAINT "product_variants_discount_range" CHECK ("discount_percent" IS NULL OR ("discount_percent" > 0 AND "discount_percent" < 100)),
  ADD CONSTRAINT "product_variants_discount_window" CHECK ("discount_start_at" IS NULL OR "discount_end_at" IS NULL OR "discount_end_at" > "discount_start_at"),
  ADD CONSTRAINT "product_variants_stock_limit_check" CHECK ("stock_limit" IS NULL OR "stock_limit" >= 0);

-- Defense in depth: the app goes through Prisma (server-only). Visitors may read active variants
-- of published products; nobody writes through the Data API.
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON "product_variants" TO anon, authenticated;

CREATE POLICY "product_variants: read active of published" ON "product_variants"
  FOR SELECT TO anon, authenticated USING (
    is_active
    AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.publish_status = 'PUBLISHED')
  );
