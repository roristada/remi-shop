-- DropIndex
DROP INDEX "products_software_trgm";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "software";

-- CreateTable
CREATE TABLE "software_tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "software_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_software_tags" (
    "product_id" UUID NOT NULL,
    "software_tag_id" UUID NOT NULL,

    CONSTRAINT "product_software_tags_pkey" PRIMARY KEY ("product_id","software_tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "software_tags_name_key" ON "software_tags"("name");

-- CreateIndex
CREATE INDEX "software_tags_is_active_sort_order_idx" ON "software_tags"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "product_software_tags_software_tag_id_idx" ON "product_software_tags"("software_tag_id");

-- AddForeignKey
ALTER TABLE "product_software_tags" ADD CONSTRAINT "product_software_tags_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_software_tags" ADD CONSTRAINT "product_software_tags_software_tag_id_fkey" FOREIGN KEY ("software_tag_id") REFERENCES "software_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
