-- Product reviews (verified buyers only; one per customer per product).
ALTER TABLE "products" ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "rating_sum" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "reviews_product_id_user_id_key" ON "reviews"("product_id", "user_id");
CREATE INDEX "reviews_product_id_is_hidden_created_at_idx" ON "reviews"("product_id", "is_hidden", "created_at" DESC);
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");
CREATE INDEX "reviews_is_hidden_created_at_idx" ON "reviews"("is_hidden", "created_at" DESC);

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense in depth: the app reads and writes through Prisma (server-only). Visitors may read
-- visible reviews of published products; nobody writes through the Data API.
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON "reviews" TO anon, authenticated;

CREATE POLICY "reviews: read visible of published" ON "reviews"
  FOR SELECT TO anon, authenticated USING (
    NOT is_hidden
    AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.publish_status = 'PUBLISHED')
  );
