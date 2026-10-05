/**
 * Copies every object of the Supabase `product-previews` bucket to Cloudflare R2 under the same
 * key, so the paths stored in the database keep working once NEXT_PUBLIC_PREVIEW_IMAGE_URL is set.
 * Safe to re-run: objects already in R2 are skipped, and nothing in Supabase is changed or deleted.
 * Run it once before switching, and once more right after (copies uploads made in between):
 *   npx tsx scripts/migrate-previews-to-r2.ts           (dry run: counts only)
 *   npx tsx scripts/migrate-previews-to-r2.ts --apply
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";
import { PrismaClient } from "../lib/generated/prisma/client";

config({ path: ".env.local", quiet: true });

const BUCKET = "product-previews";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const CONCURRENCY = 6;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (.env.local)`);
  return value;
}

async function main() {
  const apply = process.argv.includes("--apply");
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
  const base = `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${required("R2_BUCKET")}`;
  const url = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

  const objects = await prisma.$queryRaw<{ name: string; mimetype: string | null }[]>`
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

  console.log(`${objects.length} objects in ${BUCKET}${apply ? "" : " (dry run)"}`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`${apply ? "copied" : "to copy"}: ${copied}, already in R2: ${skipped}, failed: ${failed.length}`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
