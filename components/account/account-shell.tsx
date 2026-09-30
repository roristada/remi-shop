import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AccountNav } from "@/components/account/account-nav";
import { LogoutButton } from "@/components/account/logout-button";

/**
 * "My account" frame with the side menu. Shared by every page the menu links to, including the
 * ones outside /account (orders, downloads, wishlist). Auth stays in each page.
 */
export async function AccountShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("account");
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-4">
        <p className="font-heading px-3 text-lg font-medium">{t("title")}</p>
        <AccountNav />
        <LogoutButton />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
