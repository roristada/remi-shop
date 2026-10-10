-- Banner custom colour and colour-fade controls (admin request). Additive only.

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "bg_color" TEXT,
ADD COLUMN     "fade_direction" TEXT NOT NULL DEFAULT 'LEFT',
ADD COLUMN     "fade_strength" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "tint_image" BOOLEAN NOT NULL DEFAULT true;


ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_bg_color_hex" CHECK ("bg_color" IS NULL OR "bg_color" ~ '^#[0-9a-fA-F]{6}$'),
  ADD CONSTRAINT "announcements_fade_direction" CHECK ("fade_direction" IN ('LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'NONE')),
  ADD CONSTRAINT "announcements_fade_strength_range" CHECK ("fade_strength" BETWEEN 0 AND 100);
