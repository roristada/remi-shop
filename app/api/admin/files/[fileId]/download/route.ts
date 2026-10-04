import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma/client";
import { idSchema } from "@/lib/validation/product";
import { createSignedDownloadUrl } from "@/lib/storage/product-storage";
import { BUCKETS } from "@/lib/storage/buckets";

/**
 * Admin test download: the same signed URL a buyer gets (same filename handling), without an
 * order. Not recorded as a download, so reports and download limits stay untouched.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const admin = await requireAdmin();
  const { fileId } = await params;
  if (!idSchema.safeParse(fileId).success) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "File not found." } }, { status: 404 });
  }

  const file = await prisma.productVersionFile.findUnique({
    where: { id: fileId },
    select: { storagePath: true, fileName: true },
  });
  if (!file) {
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "File not found." } }, { status: 404 });
  }

  const url = await createSignedDownloadUrl(BUCKETS.digitalFiles, file.storagePath, file.fileName);
  if (!url) {
    console.error("[downloads] admin test signed url failed", { adminId: admin.id, fileId });
    return NextResponse.json({ success: false, error: { code: "STORAGE_ERROR", message: "Could not create download link." } }, { status: 502 });
  }

  console.info("[downloads] admin test download", { adminId: admin.id, fileId });
  return NextResponse.redirect(url);
}
