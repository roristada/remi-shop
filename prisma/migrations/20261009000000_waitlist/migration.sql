-- Waitlist for scheduled products: additive only.

-- In-site "now on sale" notification for waitlisted customers.
ALTER TYPE "NotificationType" ADD VALUE 'PRODUCT_AVAILABLE';

-- One row per customer and product; the primary key blocks joining twice.
CREATE TABLE "waitlist_entries" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMPTZ(6),

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("user_id","product_id")
);

CREATE INDEX "waitlist_entries_product_id_idx" ON "waitlist_entries"("product_id");

ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense in depth: the app reads and writes through Prisma (server-only). Through the Data API a
-- signed-in user may only read their own entries; nobody writes.
ALTER TABLE "waitlist_entries" ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON "waitlist_entries" TO authenticated;

CREATE POLICY "waitlist_entries: read own" ON "waitlist_entries"
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
