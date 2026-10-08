"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_LINKS } from "./nav-links";
import { LOCALE_LABELS } from "./language-switcher";
import { ThemeChoices } from "./theme-toggle";

export function MobileNav() {
  const t = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { href: "/", label: t("nav.home") },
    ...NAV_LINKS.map((l) => ({ href: l.href, label: t(`nav.${l.key}`) })),
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-xl" className="rounded-full md:hidden" aria-label={t("header.menu")}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>{t("brand")}</SheetTitle>
        </SheetHeader>
        <nav aria-label={t("header.mobileNav")} className="flex flex-col gap-1 px-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm hover:bg-accent"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <nav aria-label={t("header.language")} className="mt-4 flex gap-2 border-t px-7 pt-4">
          {routing.locales.map((l) => (
            <Link
              key={l}
              href={pathname}
              locale={l}
              onClick={() => setOpen(false)}
              aria-current={l === locale ? "true" : undefined}
              className="inline-flex h-11 items-center rounded-full border px-4 text-sm aria-[current]:border-foreground aria-[current]:bg-foreground aria-[current]:text-background"
            >
              {LOCALE_LABELS[l]}
            </Link>
          ))}
        </nav>
        <div className="mt-4 border-t px-7 pt-4">
          <ThemeChoices />
        </div>
      </SheetContent>
    </Sheet>
  );
}
