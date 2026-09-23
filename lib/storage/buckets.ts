export const BUCKETS = {
  productPreviews: "product-previews", // public
  digitalFiles: "digital-files", // private
  paymentSlips: "payment-slips", // private
  avatars: "avatars", // private
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per file
export const SIGNED_URL_TTL_SECONDS = 5 * 60;
