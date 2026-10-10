-- UAT round 3: configurable commercial-license form, request-changes / price-change review flow,
-- and an append-only request history. Additive: legacy answer columns only lose NOT NULL.

-- CreateEnum
CREATE TYPE "LicenseFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'EMAIL', 'RADIO', 'CHECKBOX', 'DROPDOWN');

-- CreateEnum
CREATE TYPE "LicenseEventType" AS ENUM ('SUBMITTED', 'CUSTOMER_EDITED', 'CHANGES_REQUESTED', 'CUSTOMER_RESPONDED', 'PRICE_ACCEPTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LicenseRequestStatus" ADD VALUE 'NEEDS_INFO';
ALTER TYPE "LicenseRequestStatus" ADD VALUE 'AWAITING_PRICE_CONFIRMATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LICENSE_CHANGES_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_LICENSE_RESPONDED';

-- AlterTable
ALTER TABLE "license_requests" ADD COLUMN     "info_request_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "info_request_message" TEXT,
ADD COLUMN     "price_change_reason" TEXT,
ADD COLUMN     "proposed_total" DECIMAL(10,2),
ALTER COLUMN "buyer_name" DROP NOT NULL,
ALTER COLUMN "buyer_email" DROP NOT NULL,
ALTER COLUMN "buyer_contact" DROP NOT NULL,
ALTER COLUMN "artist_name" DROP NOT NULL,
ALTER COLUMN "artist_contact" DROP NOT NULL,
ALTER COLUMN "platform" DROP NOT NULL;

-- AlterTable
ALTER TABLE "license_usage_types" ADD COLUMN     "conditions_en" TEXT,
ADD COLUMN     "conditions_th" TEXT;

-- CreateTable
CREATE TABLE "license_form_fields" (
    "id" UUID NOT NULL,
    "key" TEXT,
    "label_th" TEXT NOT NULL,
    "label_en" TEXT NOT NULL,
    "description_th" TEXT,
    "description_en" TEXT,
    "type" "LicenseFieldType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_request_answers" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "field_id" UUID,
    "label_th_snapshot" TEXT NOT NULL,
    "label_en_snapshot" TEXT NOT NULL,
    "type" "LicenseFieldType" NOT NULL,
    "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "values_en" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "license_request_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "license_request_events" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "type" "LicenseEventType" NOT NULL,
    "actor_id" UUID,
    "message" TEXT,
    "old_total" DECIMAL(10,2),
    "new_total" DECIMAL(10,2),
    "field_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "changes" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "license_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "license_form_fields_key_key" ON "license_form_fields"("key");

-- CreateIndex
CREATE INDEX "license_form_fields_is_active_sort_order_idx" ON "license_form_fields"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "license_request_answers_field_id_idx" ON "license_request_answers"("field_id");

-- CreateIndex
CREATE UNIQUE INDEX "license_request_answers_request_id_field_id_key" ON "license_request_answers"("request_id", "field_id");

-- CreateIndex
CREATE INDEX "license_request_events_request_id_created_at_idx" ON "license_request_events"("request_id", "created_at");

-- AddForeignKey
ALTER TABLE "license_request_answers" ADD CONSTRAINT "license_request_answers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "license_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_request_answers" ADD CONSTRAINT "license_request_answers_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "license_form_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_request_events" ADD CONSTRAINT "license_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "license_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_request_events" ADD CONSTRAINT "license_request_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Server-only tables (read and written through Prisma); no Data API access.
ALTER TABLE "license_form_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "license_request_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "license_request_events" ENABLE ROW LEVEL SECURITY;

-- The form as it was hard-coded until now, as editable built-in fields (`key` = legacy column).
INSERT INTO "license_form_fields" ("id", "key", "label_th", "label_en", "description_th", "description_en", "type", "is_required", "sort_order", "updated_at") VALUES
  ('0199d1a0-0000-7000-8000-000000000001', 'buyerName', 'ชื่อผู้ซื้อ', 'Buyer name', NULL, NULL, 'TEXT', true, 10, now()),
  ('0199d1a0-0000-7000-8000-000000000002', 'buyerEmail', 'อีเมลผู้ซื้อ', 'Buyer email', NULL, NULL, 'EMAIL', true, 20, now()),
  ('0199d1a0-0000-7000-8000-000000000003', 'buyerContact', 'ช่องทางติดต่อผู้ซื้อ', 'Buyer contact', 'เช่น เบอร์โทร, LINE ID หรือลิงก์โซเชียล', 'For example a phone number, LINE ID or social link', 'TEXT', true, 30, now()),
  ('0199d1a0-0000-7000-8000-000000000004', 'artistName', 'ชื่อศิลปิน', 'Artist name', 'ผู้สร้างผลงานที่ใช้สินค้านี้ ถ้าเป็นคนเดียวกับผู้ซื้อ กรอกซ้ำได้เลย', 'Who made the work that uses this product. If it is the buyer, enter the same details.', 'TEXT', true, 40, now()),
  ('0199d1a0-0000-7000-8000-000000000005', 'artistContact', 'ช่องทางติดต่อศิลปิน', 'Artist contact', 'เช่น เบอร์โทร, LINE ID หรือลิงก์โซเชียล', 'For example a phone number, LINE ID or social link', 'TEXT', true, 50, now()),
  ('0199d1a0-0000-7000-8000-000000000006', 'platform', 'แพลตฟอร์มที่จะใช้งาน', 'Platform', 'เช่น Etsy, Shopee, YouTube, สำนักพิมพ์', 'For example Etsy, Shopee, YouTube, a publisher', 'TEXT', true, 60, now()),
  ('0199d1a0-0000-7000-8000-000000000007', 'note', 'รายละเอียดเพิ่มเติม', 'More details', 'เช่น จำนวนที่จะผลิต หรือระยะเวลาที่ใช้งาน', 'For example print run or how long it will be used', 'TEXTAREA', false, 70, now());

-- Existing requests: copy their answers and start their history, so every screen reads one shape.
INSERT INTO "license_request_answers" ("id", "request_id", "field_id", "label_th_snapshot", "label_en_snapshot", "type", "values", "sort_order")
SELECT gen_random_uuid(), r."id", f."id", f."label_th", f."label_en", f."type", ARRAY[v.value], f."sort_order"
FROM "license_requests" AS r
CROSS JOIN LATERAL (VALUES
  ('buyerName', r."buyer_name"), ('buyerEmail', r."buyer_email"), ('buyerContact', r."buyer_contact"),
  ('artistName', r."artist_name"), ('artistContact', r."artist_contact"), ('platform', r."platform"), ('note', r."note")
) AS v(key, value)
JOIN "license_form_fields" AS f ON f."key" = v.key
WHERE v.value IS NOT NULL AND v.value <> '';

INSERT INTO "license_request_events" ("id", "request_id", "type", "new_total", "created_at")
SELECT gen_random_uuid(), r."id", 'SUBMITTED', r."total", r."created_at" FROM "license_requests" AS r;

INSERT INTO "license_request_events" ("id", "request_id", "type", "actor_id", "message", "created_at")
SELECT gen_random_uuid(), r."id",
  CASE r."status" WHEN 'APPROVED' THEN 'APPROVED'::"LicenseEventType" WHEN 'REJECTED' THEN 'REJECTED'::"LicenseEventType" ELSE 'CANCELLED'::"LicenseEventType" END,
  CASE WHEN r."status" = 'CANCELLED' THEN NULL ELSE r."reviewed_by" END,
  r."reject_reason",
  COALESCE(r."cancelled_at", r."reviewed_at", r."updated_at")
FROM "license_requests" AS r
WHERE r."status" IN ('APPROVED', 'REJECTED', 'CANCELLED');
