import { isInternalLink, isSafeLink, stripLocalePrefix } from "@/lib/validation/banner";

export type ResolvedLink = { href: string; external: boolean } | null;

/**
 * Turns a stored banner/notice link into something safe to render: site paths go through the
 * locale-aware router (any saved /th or /en prefix dropped), other http(s) URLs open in a new tab.
 * Re-checked here so a bad row can never become a javascript: link.
 */
export function resolveLink(link: string | null | undefined): ResolvedLink {
  if (!link || !isSafeLink(link)) return null;
  if (isInternalLink(link)) return { href: stripLocalePrefix(link), external: false };
  return { href: link, external: true };
}
