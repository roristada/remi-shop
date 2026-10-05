import { z } from "zod";

// NEXT_PUBLIC_* must be referenced literally so Next.js can inline them in client bundles.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  // Public base URL of the R2 bucket holding preview images. Unset = previews stay in Supabase Storage.
  NEXT_PUBLIC_PREVIEW_IMAGE_URL: z.url().optional(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  // Legacy "anon" key name still accepted.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_PREVIEW_IMAGE_URL: process.env.NEXT_PUBLIC_PREVIEW_IMAGE_URL || undefined,
});
