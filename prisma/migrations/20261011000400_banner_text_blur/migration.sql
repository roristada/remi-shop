-- Blur the picture behind banner text (admin request). Additive only.

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "text_blur" INTEGER NOT NULL DEFAULT 50;


ALTER TABLE "announcements" ADD CONSTRAINT "announcements_text_blur_range" CHECK ("text_blur" BETWEEN 0 AND 100);
