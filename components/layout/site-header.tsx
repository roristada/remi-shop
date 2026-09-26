import { getTranslations } from "next-intl/server";
import { Search, ShoppingBag, User } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav } from "./mobile-nav";
import { NAV_LINKS } from "./nav-links";

export async function SiteHeader() {
  const t = await getTranslations("common");

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
        <MobileNav />
        <Link href="/" className="mr-2 flex shrink-0 items-center gap-2 font-bold tracking-tight whitespace-nowrap">
          <span aria-hidden className="grid size-8 place-items-center rounded-full bg-primary text-sm">
            R
          </span>
          <span className="text-lg">{t("brand")}</span>
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

        <div className="ml-auto flex items-center gap-0.5">
          <Button asChild variant="ghost" size="icon-xl" className="rounded-full">
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
          <Button asChild variant="ghost" size="icon-xl" className="rounded-full">
            <Link href="/cart" aria-label={t("header.cart")}>
              <ShoppingBag />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
