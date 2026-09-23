"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/account", key: "overview" },
  { href: "/account/profile", key: "profile" },
  { href: "/orders", key: "orders" },
  { href: "/downloads", key: "downloads" },
  { href: "/wishlist", key: "wishlist" },
] as const;

export function AccountNav() {
  const t = useTranslations("account.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("overview")} className="flex gap-1 overflow-x-auto md:flex-col">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-accent",
              active && "bg-accent font-semibold",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
