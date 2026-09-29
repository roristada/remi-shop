import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser, getCurrentProfile } from "@/lib/auth/guards";
import { ProfileForm } from "@/components/account/profile-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { BackLink } from "@/components/shared/back-link";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/profile">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account.profile" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/account/profile">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/${locale}/login?next=/${locale}/account/profile`);
  const [profile, t] = await Promise.all([getCurrentProfile(), getTranslations("account.profile")]);

  return (
    <div className="space-y-6">
      <div className="md:hidden"><BackLink href="/account">{(await getTranslations("common.state"))("backToAccount")}</BackLink></div>
      <h1 className="text-2xl">{t("title")}</h1>
      <section className="rounded-2xl border p-6">
        <ProfileForm email={user.email ?? ""} displayName={profile?.displayName ?? ""} />
      </section>
      <section className="space-y-3 rounded-2xl border p-6">
        <div>
          <h2>{t("changePassword")}</h2>
          <p className="text-sm text-muted-foreground">{t("changePasswordDesc")}</p>
        </div>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
