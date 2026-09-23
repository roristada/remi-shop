import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/guards";
import { safeNextPath } from "@/lib/auth/redirect";

const LINK_ERRORS = new Set(["link_invalid"]);

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const next = safeNextPath(sp.next, `/${locale}/account`);
  const error = typeof sp.error === "string" && LINK_ERRORS.has(sp.error) ? sp.error : undefined;

  if (await getCurrentUser()) redirect(next);

  const t = await getTranslations("auth.login");
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-brand-strong hover:underline">
            {t("toRegister")}
          </Link>
        </>
      }
    >
      <LoginForm next={next} initialError={error} />
    </AuthCard>
  );
}
