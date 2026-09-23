import { getTranslations } from "next-intl/server";
import { AccountNav } from "@/components/account/account-nav";
import { LogoutButton } from "@/components/account/logout-button";

// Auth is enforced in each page (layouts don't re-run on client navigation).
export default async function AccountLayout({ children }: LayoutProps<"/[locale]/account">) {
  const t = await getTranslations("account");
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[220px_1fr]">
      <aside className="space-y-4">
        <p className="px-3 text-lg font-bold">{t("title")}</p>
        <AccountNav />
        <LogoutButton />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
