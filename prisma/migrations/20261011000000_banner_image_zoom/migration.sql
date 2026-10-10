-- Banner picture zoom (admin request). Additive only.

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "image_zoom" INTEGER NOT NULL DEFAULT 100;


ALTER TABLE "announcements" ADD CONSTRAINT "announcements_image_zoom_range" CHECK ("image_zoom" BETWEEN 100 AND 300);
