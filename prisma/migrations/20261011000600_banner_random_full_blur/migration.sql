-- Graded whole-card blur option for random product banner cards (admin request). Additive only.

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "banner_random_full_blur" BOOLEAN NOT NULL DEFAULT false;
