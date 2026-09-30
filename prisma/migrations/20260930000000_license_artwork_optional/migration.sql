-- Artwork can be attached after submitting (UAT), so it is no longer required.
ALTER TABLE "license_requests" ALTER COLUMN "artwork_path" DROP NOT NULL;
