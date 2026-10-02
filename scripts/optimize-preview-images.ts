/**
 * Creates the optimized WebP copies (card + detail, animation kept) for preview images uploaded
 * before the image pipeline existed. Safe to re-run: only images without copies are processed,
 * and originals are never changed. Run from a trusted machine:
 *   npx tsx scripts/optimize-preview-images.ts           (dry run: counts only)
 *   npx tsx scripts/optimize-preview-images.ts --apply
 *   npx tsx scripts/optimize-preview-images.ts --apply --all   (redo every image)
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "../lib/generated/prisma/client";
import { optimizedPath, pickServedPath, toWebp, type PreviewSize } from "../lib/storage/webp";

config({ path: ".env.local", quiet: true });

const BUCKET = "product-previews";
const SIZES: PreviewSize[] = ["card", "detail"];

async function main() {
  const apply = process.argv.includes("--apply");
  const all = process.argv.includes("--all");
  const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dbUrl || !supabaseUrl || !serviceKey) throw new Error("DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local)");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  const storage = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }).storage.from(BUCKET);

  try {
    const images = await prisma.productImage.findMany({
      where: all ? {} : { OR: [{ cardPath: null }, { detailPath: null }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, imagePath: true },
    });
    console.log(`${images.length} image(s) without optimized copies${apply ? "" : " (dry run — add --apply)"}`);
    if (!apply) return;

    let done = 0;
    let failed = 0;
    for (const image of images) {
      try {
        const { data, error } = await storage.download(image.imagePath);
        if (error || !data) throw new Error(error?.message ?? "download failed");
        const original = Buffer.from(await data.arrayBuffer());
        const paths: Partial<Record<PreviewSize, string>> = {};
        const notes: string[] = [];
        for (const size of SIZES) {
          const target = optimizedPath(image.imagePath, size);
          const body = await toWebp(original, size);
          const served = pickServedPath({ path: image.imagePath, bytes: original.length }, { path: target, bytes: body.length });
          if (served === target) {
            const { error: uploadError } = await storage.upload(target, body, { contentType: "image/webp", cacheControl: "31536000", upsert: true });
            if (uploadError) throw new Error(uploadError.message);
            notes.push(`${size} ${(body.length / 1024).toFixed(0)} KB`);
          } else {
            // Copy would be bigger: serve the original, and drop a copy left by an earlier run.
            await storage.remove([target]);
            notes.push(`${size} = original`);
          }
          paths[size] = served;
        }
        await prisma.productImage.update({ where: { id: image.id }, data: { cardPath: paths.card, detailPath: paths.detail } });
        done++;
        console.log(`ok   ${image.imagePath} (${(original.length / 1024).toFixed(0)} KB → ${notes.join(", ")})`);
      } catch (error) {
        failed++;
        console.error(`fail ${image.imagePath}: ${(error as Error).message}`);
      }
    }
    console.log(`Done: ${done} optimized, ${failed} failed (failed ones keep showing the original).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
