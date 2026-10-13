import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { listContactChannels } from "@/lib/contacts/queries";
import { PageHeading } from "@/components/shop/page-heading";
import { ContactLinkCards } from "@/components/shop/contact-links";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common.contact" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: { canonical: `/${locale}/contact`, languages: { th: "/th/contact", en: "/en/contact" } },
  };
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common.contact");
  const channels = await listContactChannels();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <PageHeading title={t("title")} subtitle={t("subtitle")} />
      {channels.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-4 py-16 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ContactLinkCards channels={channels} />
      )}
    </div>
  );
}
