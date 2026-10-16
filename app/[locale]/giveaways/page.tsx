import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Gift } from "lucide-react";
import { listPublicGiveaways } from "@/lib/giveaways/queries";
import { PageHeading } from "@/components/shop/page-heading";
import { GiveawayCard } from "@/components/giveaways/giveaway-card";

export async function generateMetadata({ params }: PageProps<"/[locale]/giveaways">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "giveaways" });
  return { title: t("title"), description: t("subtitle"), alternates: { canonical: `/${locale}/giveaways` } };
}

export default async function GiveawaysPage({ params }: PageProps<"/[locale]/giveaways">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, { running, past }] = await Promise.all([getTranslations("giveaways"), listPublicGiveaways(locale, new Date())]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:py-10">
      <PageHeading title={t("title")} subtitle={t("subtitle")} />

      {running.length === 0 && past.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-background/80 px-4 py-16 text-center">
          <Gift className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("empty")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <>
          {running.length > 0 && (
            <section aria-labelledby="running" className="space-y-4">
              <h2 id="running" className="text-lg font-semibold">
                {t("running")}
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {running.map((g) => (
                  <li key={g.slug} className="flex">
                    <GiveawayCard giveaway={g} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section aria-labelledby="past" className="space-y-4">
              <h2 id="past" className="text-lg font-semibold">
                {t("past")}
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {past.map((g) => (
                  <li key={g.slug} className="flex">
                    <GiveawayCard giveaway={g} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
