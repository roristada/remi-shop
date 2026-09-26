import { useLocale, useTranslations } from "next-intl";
import { BriefcaseBusiness, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale, localized } from "@/i18n/localize";
import { formatTHB, toHundredths } from "@/lib/pricing/calculate";
import type { LicenseOffer } from "@/lib/licenses/rules";

/** Commercial-use option on the product page. Prices come from the server; the product discount never applies. */
export function LicenseOfferPanel({ offers, productSlug }: { offers: LicenseOffer[]; productSlug: string }) {
  const t = useTranslations("shop.license");
  const locale = useLocale();
  const fmt = intlLocale(locale);

  return (
    <section aria-labelledby="license-heading" className="space-y-3 rounded-3xl border p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <BriefcaseBusiness className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
        <div className="space-y-1">
          <h2 id="license-heading" className="text-lg">
            {t("title")}
          </h2>
          <p className="text-sm text-foreground/70">{t("intro")}</p>
        </div>
      </div>
      <ul className="divide-y rounded-2xl bg-secondary/35 text-sm">
        {offers.map((o) => (
          <li key={o.usageTypeId} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0">{localized(locale, o.nameTH, o.nameEN)}</span>
            <span className="shrink-0 font-medium tabular-nums">{formatTHB(toHundredths(o.price), fmt.number)}</span>
          </li>
        ))}
      </ul>
      <Link
        href={`/product/${productSlug}/license`}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-foreground/15 px-4 text-sm font-medium transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {t("cta")} <ChevronRight className="size-4" aria-hidden />
      </Link>
      <p className="text-xs text-foreground/70">{t("ctaHint")}</p>
    </section>
  );
}
