import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser, getCurrentProfile } from "@/lib/auth/guards";
import { ProfileForm } from "@/components/account/profile-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";

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
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <ProfileForm email={user.email ?? ""} displayName={profile?.displayName ?? ""} />
      </section>
      <section className="space-y-3 rounded-2xl border bg-card p-6 shadow-soft">
        <div>
          <h2 className="font-semibold">{t("changePassword")}</h2>
          <p className="text-sm text-muted-foreground">{t("changePasswordDesc")}</p>
        </div>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
