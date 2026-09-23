import { routing, type Locale } from "@/i18n/routing";

/**
 * Accepts only same-origin relative paths ("/th/account"), rejecting
 * protocol-relative ("//evil.com"), backslash tricks and absolute URLs.
 */
export function safeNextPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  try {
    const url = new URL(next, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}

export function toLocale(value: unknown): Locale {
  return routing.locales.includes(value as Locale) ? (value as Locale) : routing.defaultLocale;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
