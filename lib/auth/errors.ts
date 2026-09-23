import type { AuthError } from "@supabase/supabase-js";

/** Maps Supabase Auth error codes to `auth.errors.*` translation keys. */
export function authErrorKey(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "invalid_credentials";
    case "email_not_confirmed":
      return "email_not_confirmed";
    case "weak_password":
      return "weak_password";
    case "same_password":
      return "same_password";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rate_limited";
    case "session_not_found":
    case "session_expired":
      return "session_expired";
    default:
      if (error.status === 429) return "rate_limited";
      // SMTP misconfiguration surfaces as a bare 500 with no code.
      if (/sending .*email/i.test(error.message)) {
        console.error("[auth] email delivery failed — check Supabase SMTP settings", { message: error.message });
        return "email_send_failed";
      }
      console.error("[auth] unexpected error", { code: error.code, status: error.status, message: error.message });
      return "unknown";
  }
}
