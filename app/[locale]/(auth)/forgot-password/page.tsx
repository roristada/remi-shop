import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

const LINK_ERRORS = new Set(["link_invalid"]);

export async function generateMetadata({ params }: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.forgot" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ForgotPasswordPage({ params, searchParams }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const error = typeof sp.error === "string" && LINK_ERRORS.has(sp.error) ? sp.error : undefined;

  const t = await getTranslations("auth");
  return (
    <AuthCard
      title={t("forgot.title")}
      subtitle={t("forgot.subtitle")}
      footer={
        <Link href="/login" className="font-medium text-brand-strong hover:underline">
          {t("verify.backToLogin")}
        </Link>
      }
    >
      <ForgotPasswordForm initialError={error} />
    </AuthCard>
  );
}
