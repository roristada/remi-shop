/**
 * Structured `[security]` warn logs for rejected or suspicious requests, so they show up in
 * `railway logs` (filter on `[security]`).
 * The client IP is masked (IPv4 /24, IPv6 /48) — enough to spot one source hammering the site
 * without storing a full personal identifier. Never pass emails, tokens or passwords here.
 */

const MAX_UA_LENGTH = 120;

/** Paths only scanners ask for — this app has no PHP, WordPress or dotfiles. */
const PROBE_PATH =
  /(?:^|\/)(?:\.env|\.git|\.aws|\.ssh|\.DS_Store|wp-admin|wp-login|wp-content|wp-includes|xmlrpc|phpmyadmin|pma|cgi-bin|vendor\/phpunit|server-status|actuator|boaform|HNAP1)(?:[/.?]|$)|\.(?:php\d?|asp|aspx|jsp|cgi|sql|bak|ini|yml|yaml)$/i;

export function isProbePath(pathname: string): boolean {
  return PROBE_PATH.test(pathname);
}

export function maskIp(ip: string | null | undefined): string | null {
  const value = ip?.split(",")[0]?.trim();
  if (!value) return null;
  if (value.includes(":")) return `${value.split(":").slice(0, 3).join(":")}::/48`;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  return `${parts.slice(0, 3).join(".")}.0/24`;
}

export type ClientMeta = { ip: string | null; country: string | null; ua: string | null };

/**
 * DigitalOcean App Platform sets `do-connecting-ip` (its `x-forwarded-for` holds the ingress, not the client);
 * Cloudflare (proxied DNS) sets `cf-connecting-ip` / `cf-ipcountry`; `x-real-ip` / `x-forwarded-for` cover
 * other hosts. Log-only: a client could forge these where no proxy rewrites them.
 */
export function clientMeta(headers: Headers): ClientMeta {
  const ip =
    headers.get("do-connecting-ip") ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for");
  return {
    ip: maskIp(ip),
    country: headers.get("cf-ipcountry"),
    ua: headers.get("user-agent")?.slice(0, MAX_UA_LENGTH) ?? null,
  };
}

export function logSecurityEvent(event: string, details: Record<string, unknown>): void {
  console.warn(`[security] ${event}`, details);
}
