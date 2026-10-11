-- Commercial-license form per usage type: fields can be limited to some usage types, plus URL and
-- FILE field kinds. Additive only.


-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LicenseFieldType" ADD VALUE 'URL';
ALTER TYPE "LicenseFieldType" ADD VALUE 'FILE';

-- AlterTable
ALTER TABLE "license_form_fields" ADD COLUMN     "applies_to_all_types" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "license_request_answers" ADD COLUMN     "file_path" TEXT;

-- CreateTable
CREATE TABLE "license_form_field_usage_types" (
    "field_id" UUID NOT NULL,
    "usage_type_id" UUID NOT NULL,

    CONSTRAINT "license_form_field_usage_types_pkey" PRIMARY KEY ("field_id","usage_type_id")
);

-- CreateIndex
CREATE INDEX "license_form_field_usage_types_usage_type_id_idx" ON "license_form_field_usage_types"("usage_type_id");

-- AddForeignKey
ALTER TABLE "license_form_field_usage_types" ADD CONSTRAINT "license_form_field_usage_types_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "license_form_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "license_form_field_usage_types" ADD CONSTRAINT "license_form_field_usage_types_usage_type_id_fkey" FOREIGN KEY ("usage_type_id") REFERENCES "license_usage_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Server-only table (Prisma via the service connection); no client policies.
ALTER TABLE "license_form_field_usage_types" ENABLE ROW LEVEL SECURITY;

-- FILE answers may be PDFs; they share the private license-artworks bucket (still 5 MB).
UPDATE storage.buckets
SET allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
WHERE id = 'license-artworks';
