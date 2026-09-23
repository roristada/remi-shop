import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, Download, Heart, Receipt, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser, getCurrentProfile } from "@/lib/auth/guards";
import { FormMessage } from "@/components/auth/form-fields";

const NOTICES = { verified: "verified", passwordUpdated: "passwordUpdated" } as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/account">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title"), robots: { index: false } };
}

export default async function AccountPage({ params, searchParams }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/${locale}/login?next=/${locale}/account`);
  const [profile, t, tAuth, sp] = await Promise.all([
    getCurrentProfile(),
    getTranslations("account"),
    getTranslations("auth.notices"),
    searchParams,
  ]);
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice as keyof typeof NOTICES] : undefined;
  const name = profile?.displayName ?? user.email ?? "";

  const cards = [
    { href: "/orders", icon: Receipt, title: t("nav.orders"), desc: t("overview.ordersDesc") },
    { href: "/downloads", icon: Download, title: t("nav.downloads"), desc: t("overview.downloadsDesc") },
    { href: "/wishlist", icon: Heart, title: t("nav.wishlist"), desc: t("overview.wishlistDesc") },
    { href: "/account/profile", icon: UserRound, title: t("nav.profile"), desc: t("overview.profileDesc") },
  ] as const;

  return (
    <div className="space-y-6">
      {notice && <FormMessage tone="success">{tAuth(notice)}</FormMessage>}
      <h1 className="text-2xl font-bold break-words">{t("greeting", { name })}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(({ href, icon: Icon, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-soft transition-colors hover:border-primary"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{title}</span>
              <span className="block text-sm text-muted-foreground">{desc}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}
