-- Ticker option for the home-page announcement bar (admin request). Additive only.

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "announcement_bar_scroll" BOOLEAN NOT NULL DEFAULT false;
