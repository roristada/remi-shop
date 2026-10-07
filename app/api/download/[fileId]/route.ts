import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { idSchema } from "@/lib/validation/product";
import { checkDownloadAccess, recordDownload } from "@/lib/downloads/queries";
import { createSignedDownloadUrl } from "@/lib/storage/product-storage";
import { BUCKETS } from "@/lib/storage/buckets";

type Locale = "th" | "en";

function toLocale(v: string | null): Locale {
  return v === "en" ? "en" : "th";
}

function errorRedirect(origin: string, locale: Locale, code: string) {
  return NextResponse.redirect(new URL(`/${locale}/downloads?error=${code}`, origin));
}

function jsonError(status: number, code: string) {
  return NextResponse.json({ success: false, error: { code } }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * The stable "download" link. Every click re-authorizes server-side (ownership + limit + rate
 * limit) and hands back a signed URL that expires in minutes — never a permanent link.
 * `?format=json` answers with `{ url }` instead of a redirect, for "download all" on the
 * downloads page, which fetches one file at a time and reports failures in place.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { origin, searchParams } = request.nextUrl;
  const locale = toLocale(searchParams.get("locale"));
  const { fileId } = await params;
  const json = searchParams.get("format") === "json";
  const fail = (status: number, code: string) => (json ? jsonError(status, code) : errorRedirect(origin, locale, code));

  const user = await getCurrentUser();
  if (!user) {
    if (json) return jsonError(401, "unauthenticated");
    return NextResponse.redirect(new URL(`/${locale}/login?next=${encodeURIComponent(`/${locale}/downloads`)}`, origin));
  }
  if (!idSchema.safeParse(fileId).success) return fail(404, "not_found");

  const now = new Date();
  const access = await checkDownloadAccess(user.id, fileId, now);
  if (!access.ok) return fail(access.code === "not_found" ? 404 : 403, access.code);

  const url = await createSignedDownloadUrl(BUCKETS.digitalFiles, access.storagePath, access.fileName);
  if (!url) {
    console.error("[downloads] signed url failed", { userId: user.id, fileId });
    return fail(500, "error");
  }

  if (!access.skipLog) {
    await recordDownload({ userId: user.id, orderId: access.orderId, productId: access.productId, fileId });
    console.info("[downloads] file downloaded", { userId: user.id, fileId, productId: access.productId });
  }

  if (json) return NextResponse.json({ success: true, data: { url } }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.redirect(url);
}
