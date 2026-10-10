-- UAT round 3: cost/profit tracking from the admin cost sheet, and the "files emailed" delivery marker. Additive only.

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "cost" DECIMAL(10,2),
ADD COLUMN     "cost_is_promo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cost_rate" DECIMAL(10,4),
ADD COLUMN     "cost_yuan" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "files_emailed_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "cost_rate" DECIMAL(10,4) NOT NULL DEFAULT 5.1,
ADD COLUMN     "cost_sheet_id" TEXT,
ADD COLUMN     "cost_synced_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "cost_references" (
    "id" UUID NOT NULL,
    "tab" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_zh" TEXT NOT NULL,
    "match_en" TEXT NOT NULL,
    "match_zh" TEXT NOT NULL,
    "cost_yuan" DECIMAL(10,2) NOT NULL,
    "is_promo" BOOLEAN NOT NULL DEFAULT false,
    "promo_start_at" TIMESTAMPTZ(6),
    "promo_end_at" TIMESTAMPTZ(6),
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_references_tab_idx" ON "cost_references"("tab");


-- Server-only table (Prisma); no Data API access.
ALTER TABLE "cost_references" ENABLE ROW LEVEL SECURITY;

-- The sheet the client shared (UAT round 3); changeable in admin.
UPDATE "store_settings" SET "cost_sheet_id" = '15CgKY95NTakwCAwxV9-Lcj7YADix6Dn3etf5WKp3S6U' WHERE "id" = 1 AND "cost_sheet_id" IS NULL;
