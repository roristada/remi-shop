-- UAT round 2: additive only.

-- Review reminders after 7/15/30 days (in-site notifications).
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_REMINDER';

-- Anonymous reviews; the body may be empty (stars only).
ALTER TABLE "reviews" ADD COLUMN "is_anonymous" BOOLEAN NOT NULL DEFAULT false;

-- Owner's internal note per order. A separate table so the customer's "orders: read own"
-- policy never covers it: RLS on, no grants, written and read only through Prisma.
CREATE TABLE "order_admin_notes" (
    "order_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_admin_notes_pkey" PRIMARY KEY ("order_id"),
    CONSTRAINT "order_admin_notes_body_length" CHECK (char_length("body") <= 2000)
);
ALTER TABLE "order_admin_notes" ADD CONSTRAINT "order_admin_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_admin_notes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "order_admin_notes" FROM anon, authenticated;

-- Optimized WebP copies of preview images.
ALTER TABLE "product_images" ADD COLUMN "card_path" TEXT;
ALTER TABLE "product_images" ADD COLUMN "detail_path" TEXT;

-- Picture per purchasable option.
ALTER TABLE "product_variants" ADD COLUMN "image_path" TEXT;
