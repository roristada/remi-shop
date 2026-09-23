import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/proxy";

const handleI18n = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Admin (Thai-only), API and auth callback routes are not locale-prefixed.
  const skipI18n =
    pathname.startsWith("/admin") || pathname.startsWith("/api") || pathname.startsWith("/auth/");

  const response = skipI18n ? NextResponse.next({ request }) : handleI18n(request);
  return updateSession(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
