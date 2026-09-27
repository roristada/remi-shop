import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { idSchema } from "@/lib/validation/product";
import { checkDownloadAccess, recordDownload } from "@/lib/downloads/queries";
import { createSignedViewUrls } from "@/lib/storage/payment-storage";
import { BUCKETS } from "@/lib/storage/buckets";

type Locale = "th" | "en";

function toLocale(v: string | null): Locale {
  return v === "en" ? "en" : "th";
}

function errorRedirect(origin: string, locale: Locale, code: string) {
  return NextResponse.redirect(new URL(`/${locale}/downloads?error=${code}`, origin));
}

/**
 * The stable "download" link. Every click re-authorizes server-side (ownership + limit + rate
 * limit) and hands back a signed URL that expires in minutes — never a permanent link.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { origin, searchParams } = request.nextUrl;
  const locale = toLocale(searchParams.get("locale"));
  const { fileId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/${locale}/login?next=${encodeURIComponent(`/${locale}/downloads`)}`, origin));
  }
  if (!idSchema.safeParse(fileId).success) return errorRedirect(origin, locale, "not_found");

  const now = new Date();
  const access = await checkDownloadAccess(user.id, fileId, now);
  if (!access.ok) return errorRedirect(origin, locale, access.code);

  const urls = await createSignedViewUrls(BUCKETS.digitalFiles, [access.storagePath]);
  const url = urls.get(access.storagePath);
  if (!url) {
    console.error("[downloads] signed url failed", { userId: user.id, fileId });
    return errorRedirect(origin, locale, "error");
  }

  if (!access.skipLog) {
    await recordDownload({ userId: user.id, orderId: access.orderId, productId: access.productId, fileId });
    console.info("[downloads] file downloaded", { userId: user.id, fileId, productId: access.productId });
  }

  return NextResponse.redirect(url);
}
