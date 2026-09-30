-- Product files may be up to 50 MB (UAT round 1). The app already allows it; this CHECK still said 5 MB.
ALTER TABLE "product_version_files" DROP CONSTRAINT "product_version_files_size";
ALTER TABLE "product_version_files" ADD CONSTRAINT "product_version_files_size" CHECK ("file_size" > 0 AND "file_size" <= 52428800);
