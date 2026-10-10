-- Optional depth-of-field blur on the banner card right edge (admin request). Additive only.

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "edge_blur" BOOLEAN NOT NULL DEFAULT false;

