export const BUCKETS = {
  productPreviews: "product-previews", // public
  digitalFiles: "digital-files", // private
  paymentSlips: "payment-slips", // private
  avatars: "avatars", // private
  licenseArtworks: "license-artworks", // private
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB: customer uploads (slips, artwork) and QR
export const MAX_PRODUCT_FILE_SIZE = 50 * 1024 * 1024; // 50 MB: admin product images and digital files

/** Per-file size cap for uploads into `bucket`. Keep in sync with supabase/sql/001_storage_buckets.sql. */
export function maxUploadSize(bucket: BucketName): number {
  return bucket === BUCKETS.productPreviews || bucket === BUCKETS.digitalFiles ? MAX_PRODUCT_FILE_SIZE : MAX_FILE_SIZE;
}
export const SIGNED_URL_TTL_SECONDS = 5 * 60;
