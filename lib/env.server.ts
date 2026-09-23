import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

let cached: z.infer<typeof serverSchema> | undefined;

/** Lazily validated so builds don't fail on pages that never touch server secrets. */
export function serverEnv() {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
