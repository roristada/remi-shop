import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localized } from "@/i18n/localize";
import { requireUser } from "@/lib/auth/guards";
import { toHundredths } from "@/lib/pricing/calculate";
import { idSchema } from "@/lib/validation/product";
import { getLicenseRequestForEdit } from "@/lib/licenses/queries";
import { canEditLicenseRequest, licenseEditDeadline } from "@/lib/licenses/rules";
import { LicenseRequestForm } from "@/components/shop/license-request-form";
import { BackLink } from "@/components/shared/back-link";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/licenses/[id]/edit">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "shop.license" });
  return { title: t("editTitle"), robots: { index: false } };
}

export default async function EditLicenseRequestPage({ params }: PageProps<"/[locale]/account/licenses/[id]/edit">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const path = `/${locale}/account/licenses/${id}/edit`;
  const user = await requireUser(`/${locale}/login?next=${encodeURIComponent(path)}`);
  await connection(); // The edit window depends on the current time.
  if (!idSchema.safeParse(id).success) notFound();

  const request = await getLicenseRequestForEdit(user.id, id);
  if (!request) notFound();

  const t = await getTranslations("shop.license");
  const name = localized(locale, request.productNameTHSnapshot, request.productNameENSnapshot);
  const editable = canEditLicenseRequest(request.status, request.createdAt);

  return (
    <div className="space-y-6">
      <BackLink href="/account/licenses">{(await getTranslations("account.licenses"))("title")}</BackLink>
      <div className="space-y-2">
        <h1 className="text-2xl">{t("editTitle")}</h1>
        <p className="text-foreground/75">{t("editIntro", { product: name })}</p>
      </div>

      {editable ? (
        <LicenseRequestForm
          productId=""
          offers={[]}
          defaults={{ buyerName: "", buyerEmail: "" }}
          edit={{
            requestId: request.id,
            values: {
              buyerName: request.buyerName,
              buyerEmail: request.buyerEmail,
              buyerContact: request.buyerContact,
              artistName: request.artistName,
              artistContact: request.artistContact,
              platform: request.platform,
              note: request.note ?? "",
            },
            lines: request.items.map((i) => ({
              id: i.id,
              name: localized(locale, i.nameTHSnapshot, i.nameENSnapshot),
              price: toHundredths(i.price),
            })),
            total: toHundredths(request.total),
            hasArtwork: request.artworkPath !== null,
            editableUntil: licenseEditDeadline(request.createdAt).toISOString(),
          }}
        />
      ) : (
        <p role="status" className="rounded-2xl bg-muted px-4 py-3 text-sm">
          {t("editClosed")}
        </p>
      )}
    </div>
  );
}
