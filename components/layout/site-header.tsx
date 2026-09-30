import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Search, User } from "lucide-react";
import { Link, getPathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav } from "./mobile-nav";
import { HeaderCartButton } from "@/components/cart/header-cart-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { NAV_LINKS } from "./nav-links";

export async function SiteHeader() {
  const [t, locale] = await Promise.all([getTranslations("common"), getLocale()]);
  const searchAction = getPathname({ href: "/search", locale });

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <MobileNav />
        <Link href="/" className="mr-2 flex shrink-0 items-center gap-2 font-bold tracking-tight whitespace-nowrap">
          {/* Decorative: the wordmark beside it names the link. */}
          <Image src="/brand/remi-mark.png" alt="" width={44} height={44} priority className="size-11" />
          <span className="font-heading text-lg">{t("brand")}</span>
        </Link>

        <nav aria-label={t("header.mainNav")} className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t(`nav.${l.key}`)}
            </Link>
          ))}
        </nav>

        {/* A real, submittable search — not decoration — but only where the header has room. */}
        <form action={searchAction} role="search" className="mx-2 hidden max-w-56 flex-1 lg:block">
          <label className="sr-only" htmlFor="header-search">
            {t("header.search")}
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="header-search"
              type="search"
              name="q"
              placeholder={t("header.search")}
              className="h-10 rounded-full bg-secondary/45 pl-10"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-0.5">
          <Button asChild variant="ghost" size="icon-xl" className="rounded-full lg:hidden">
            <Link href="/search" aria-label={t("header.search")}>
              <Search />
            </Link>
          </Button>
          {/* On phones the language choice lives in the menu sheet, so the logo keeps one line. */}
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <Button asChild variant="ghost" size="icon-xl" className="rounded-full">
            <Link href="/account" aria-label={t("header.account")}>
              <User />
            </Link>
          </Button>
          <NotificationBell />
          <HeaderCartButton />
        </div>
      </div>
    </header>
  );
}
