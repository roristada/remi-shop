import type { Metadata } from "next";
import { PreviewImage } from "@/components/shared/preview-image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download as DownloadIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localize";
import { requireUser } from "@/lib/auth/guards";
import { listOwnedProducts, type OwnedProduct } from "@/lib/downloads/queries";
import { previewImageSrc } from "@/lib/storage/public-url";
import { PageHeading } from "@/components/shop/page-heading";
import { ShopPagination } from "@/components/shop/shop-pagination";
import { FormMessage } from "@/components/auth/form-fields";
import { DownloadVersions } from "@/components/downloads/download-versions";

const ERROR_CODES = ["not_found", "forbidden", "limit_reached", "error"] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/downloads">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "downloads" });
  return { title: t("title"), robots: { index: false } };
}

export default async function DownloadsPage({ params, searchParams }: PageProps<"/[locale]/downloads">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(`/${locale}/login?next=${encodeURIComponent(`/${locale}/downloads`)}`);
  const sp = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));
  const errorCode = ERROR_CODES.find((c) => c === sp.error);

  const [t, { items, total, pageCount }] = await Promise.all([
    getTranslations("downloads"),
    listOwnedProducts(user.id, page),
  ]);

  return (
    <div className="space-y-6">
      <PageHeading title={t("title")} subtitle={t("resultCount", { count: total })} />
      {errorCode && <FormMessage tone="error">{t(`errors.${errorCode}`)}</FormMessage>}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-background/80 px-4 py-16 text-center">
          <DownloadIcon className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("empty")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((p) => (
            <OwnedProductCard key={p.productId} product={p} locale={locale} />
          ))}
        </ul>
      )}
      <ShopPagination page={page} pageCount={pageCount} params={{}} path="/downloads" />
    </div>
  );
}

function OwnedProductCard({ product: p, locale }: { product: OwnedProduct; locale: string }) {
  const name = localized(locale, p.nameTH, p.nameEN);
  const categoryName = localized(locale, p.categoryNameTH, p.categoryNameEN);

  return (
    <li className="space-y-4 rounded-3xl border p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-secondary/60">
          {p.image ? (
            <PreviewImage
              src={previewImageSrc(p.image, "card")}
              alt={localized(locale, p.image.altTextTH, p.image.altTextEN) || name}
              fill
              sizes="56px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <Link href={`/product/${p.slug}`} className="font-semibold hover:underline">
            {name}
          </Link>
          <p className="text-xs text-muted-foreground">{categoryName}</p>
          {p.variantNames.length > 0 && (
            <p className="text-sm text-muted-foreground">{p.variantNames.map((v) => localized(locale, v.th, v.en)).join(", ")}</p>
          )}
        </div>
      </div>

      <DownloadVersions versions={p.versions} downloadLimit={p.downloadLimit} locale={locale} />
    </li>
  );
}
