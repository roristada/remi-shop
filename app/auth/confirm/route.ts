import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath, toLocale } from "@/lib/auth/redirect";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

/**
 * Landing point for Supabase email links (signup confirmation, password recovery).
 * Supports both the token-hash template (`?token_hash=&type=`, works across devices)
 * and the default PKCE redirect (`?code=`, same browser only).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/th/account");
  const locale = toLocale(next.split("/")[1]);

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) {
    const failTarget = next.includes("/reset-password") ? "forgot-password" : "login";
    return NextResponse.redirect(new URL(`/${locale}/${failTarget}?error=link_invalid`, origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
