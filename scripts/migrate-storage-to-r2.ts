/**
 * Copies every object of a Supabase bucket to Cloudflare R2 under the same key, so the paths stored
 * in the database keep working once the app is switched over:
 *   previews: `product-previews` → R2_BUCKET        (switch: NEXT_PUBLIC_PREVIEW_IMAGE_URL)
 *   files:    `digital-files`    → R2_FILES_BUCKET  (switch: R2_FILES_BUCKET on the host)
 * Safe to re-run: objects already in R2 are skipped, and nothing in Supabase is changed or deleted.
 * Run it once before switching, and once more right after (copies uploads made in between):
 *   npx tsx scripts/migrate-storage-to-r2.ts files           (dry run: counts only)
 *   npx tsx scripts/migrate-storage-to-r2.ts files --apply
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";
import { PrismaClient } from "../lib/generated/prisma/client";

config({ path: ".env.local", quiet: true });

// Same cache headers as lib/storage/r2.ts; purchased files must never sit in a shared cache.
const TARGETS = {
  previews: { bucket: "product-previews", r2Bucket: "R2_BUCKET", cacheControl: "public, max-age=31536000, immutable" },
  files: { bucket: "digital-files", r2Bucket: "R2_FILES_BUCKET", cacheControl: "private, no-store" },
} as const;
const CONCURRENCY = 6;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (.env.local)`);
  return value;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const target = process.argv[2];
  if (target !== "previews" && target !== "files") throw new Error("Usage: migrate-storage-to-r2.ts <previews|files> [--apply]");
  const { bucket: BUCKET, r2Bucket, cacheControl: CACHE_CONTROL } = TARGETS[target];
  const dbUrl = process.env.DIRECT_URL ?? required("DATABASE_URL");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  const storage = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  }).storage.from(BUCKET);
  const r2 = new AwsClient({
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    service: "s3",
    region: "auto",
  });
  const base = `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${required(r2Bucket)}`;
  const url = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

  // Files: only objects a file row points at. Leftovers of unsaved uploads are not worth the
  // Supabase egress of copying them; they stay in Supabase untouched.
  const objects =
    target === "files"
      ? await prisma.$queryRaw<{ name: string; mimetype: string | null }[]>`
          select o.name, o.metadata->>'mimetype' as mimetype
          from storage.objects o join product_version_files f on f.storage_path = o.name
          where o.bucket_id = ${BUCKET}
          order by o.name`
      : await prisma.$queryRaw<{ name: string; mimetype: string | null }[]>`
          select name, metadata->>'mimetype' as mimetype
          from storage.objects where bucket_id = ${BUCKET} and name not like '%.emptyFolderPlaceholder'
          order by name`;
  await prisma.$disconnect();

  let copied = 0;
  let skipped = 0;
  const failed: string[] = [];
  let next = 0;

  async function worker() {
    while (next < objects.length) {
      const { name, mimetype } = objects[next++];
      try {
        const head = await r2.fetch(url(name), { method: "HEAD" });
        if (head.ok) {
          skipped++;
          continue;
        }
        if (!apply) {
          copied++;
          continue;
        }
        const { data, error } = await storage.download(name);
        if (error || !data) throw new Error(error?.message ?? "download failed");
        const put = await r2.fetch(url(name), {
          method: "PUT",
          headers: { "content-type": mimetype ?? "application/octet-stream", "cache-control": CACHE_CONTROL },
          body: new Uint8Array(await data.arrayBuffer()),
        });
        if (!put.ok) throw new Error(`R2 PUT ${put.status}`);
        copied++;
      } catch (e) {
        failed.push(name);
        console.error(`  failed: ${name} (${(e as Error).message})`);
      }
    }
  }

  console.log(`${objects.length} objects in ${BUCKET} → ${process.env[r2Bucket]}${apply ? "" : " (dry run)"}`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`${apply ? "copied" : "to copy"}: ${copied}, already in R2: ${skipped}, failed: ${failed.length}`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
