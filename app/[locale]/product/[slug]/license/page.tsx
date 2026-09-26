import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localize";
import { getCurrentProfile, requireUser } from "@/lib/auth/guards";
import { toHundredths } from "@/lib/pricing/calculate";
import { getProductStatus } from "@/lib/products/status";
import { getShopProduct } from "@/lib/products/storefront-queries";
import { getLicenseOffers, getUsageTypeDescriptions } from "@/lib/licenses/queries";
import { LicenseRequestForm } from "@/components/shop/license-request-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/product/[slug]/license">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.license" });
  return { title: t("formTitle"), robots: { index: false } };
}

export default async function LicenseRequestPage({ params }: PageProps<"/[locale]/product/[slug]/license">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const path = `/${locale}/product/${slug}/license`;
  const user = await requireUser(`/${locale}/login?next=${encodeURIComponent(path)}`);
  await connection(); // Availability depends on the current time.

  const product = await getShopProduct(slug);
  if (!product || product.category.status !== "ACTIVE") notFound();

  const [t, profile] = await Promise.all([getTranslations("shop.license"), getCurrentProfile()]);
  const name = localized(locale, product.nameTH, product.nameEN);
  const available = getProductStatus(product, new Date()) === "ACTIVE";
  const offers = available ? await getLicenseOffers(product.id) : [];
  const descriptions = await getUsageTypeDescriptions(offers.map((o) => o.usageTypeId));
  const descById = new Map(descriptions.map((d) => [d.id, localized(locale, d.descriptionTH, d.descriptionEN)]));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <Link
        href={`/product/${product.slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> {name}
      </Link>
      <div className="space-y-2">
        <h1 className="font-sans text-2xl font-semibold sm:text-3xl">{t("formTitle")}</h1>
        <p className="text-foreground/75">{t("formIntro", { product: name })}</p>
      </div>

      {offers.length === 0 ? (
        <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-sm">
          {t("notOffered")}
        </p>
      ) : (
        <LicenseRequestForm
          productId={product.id}
          offers={offers.map((o) => ({
            usageTypeId: o.usageTypeId,
            name: localized(locale, o.nameTH, o.nameEN),
            description: descById.get(o.usageTypeId) ?? null,
            price: toHundredths(o.price),
          }))}
          defaults={{ buyerName: profile?.displayName ?? "", buyerEmail: profile?.email ?? user.email ?? "" }}
        />
      )}
    </div>
  );
}
