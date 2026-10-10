-- UAT round 3: home-page banner carousel cards + a small announcement bar. Additive only.

-- CreateEnum
CREATE TYPE "BannerTheme" AS ENUM ('PINK', 'LILAC', 'SKY', 'BUTTER', 'MINT');

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "cta_en" TEXT,
ADD COLUMN     "cta_th" TEXT,
ADD COLUMN     "image_focus_x" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "image_focus_y" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "theme" "BannerTheme" NOT NULL DEFAULT 'PINK';

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_image_focus_x_range" CHECK ("image_focus_x" BETWEEN 0 AND 100),
  ADD CONSTRAINT "announcements_image_focus_y_range" CHECK ("image_focus_y" BETWEEN 0 AND 100);

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "announcement_bar_en" TEXT,
ADD COLUMN     "announcement_bar_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "announcement_bar_link" TEXT,
ADD COLUMN     "announcement_bar_th" TEXT;
