import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

const NAMESPACES = ["common", "home", "auth", "account", "shop", "cart"] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => [ns, (await import(`../locales/${locale}/${ns}.json`)).default]),
  );

  return { locale, messages: Object.fromEntries(entries), timeZone: "Asia/Bangkok" };
});
