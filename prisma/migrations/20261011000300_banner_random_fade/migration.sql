-- Option to drop the colour fade on random product banner cards (admin request). Additive only.

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "banner_random_fade" BOOLEAN NOT NULL DEFAULT true;

