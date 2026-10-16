-- Admin-picked drawn icon for a category (null = guessed from the slug). Additive only.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "icon_key" TEXT;
