-- Random product cards in the home banner carousel (admin request). Additive only.

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "banner_random_count" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "banner_random_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "banner_random_folder_id" UUID;


ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_banner_random_count_range" CHECK ("banner_random_count" BETWEEN 1 AND 8);
