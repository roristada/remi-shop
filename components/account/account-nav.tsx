"use client";

import { useTranslations } from "next-intl";
import { BriefcaseBusiness, Download, Heart, LayoutGrid, Receipt, UserRound } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/account", key: "overview", icon: LayoutGrid },
  { href: "/account/profile", key: "profile", icon: UserRound },
  { href: "/orders", key: "orders", icon: Receipt },
  { href: "/account/licenses", key: "licenses", icon: BriefcaseBusiness },
  { href: "/downloads", key: "downloads", icon: Download },
  { href: "/wishlist", key: "wishlist", icon: Heart },
] as const;

export function AccountNav() {
  const t = useTranslations("account.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("overview")} className="flex gap-1 overflow-x-auto md:flex-col">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-accent",
              active && "bg-accent font-semibold",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
