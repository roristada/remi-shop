import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // Automatic slip check. Both unset = every slip is reviewed by hand.
  SLIPOK_BRANCH_ID: z.string().optional(),
  SLIPOK_API_KEY: z.string().optional(),
  // Cloudflare R2 for product preview images; needed once NEXT_PUBLIC_PREVIEW_IMAGE_URL is set.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
});

let cached: z.infer<typeof serverSchema> | undefined;

/** Lazily validated so builds don't fail on pages that never touch server secrets. */
export function serverEnv() {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
