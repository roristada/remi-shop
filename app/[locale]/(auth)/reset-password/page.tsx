import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getCurrentUser } from "@/lib/auth/guards";

export async function generateMetadata({ params }: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.reset" });
  return { title: t("title"), robots: { index: false } };
}

/** Reached via the recovery email link → /auth/confirm, which creates the session. */
export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await getCurrentUser())) redirect(`/${locale}/forgot-password?error=link_invalid`);

  const t = await getTranslations("auth.reset");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
