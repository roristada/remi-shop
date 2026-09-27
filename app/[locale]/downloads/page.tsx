import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download as DownloadIcon, FileArchive } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale, localized } from "@/i18n/localize";
import { requireUser } from "@/lib/auth/guards";
import { listOwnedProducts, type OwnedProduct } from "@/lib/downloads/queries";
import { previewImageUrl } from "@/lib/storage/public-url";
import { PageHeading } from "@/components/shop/page-heading";
import { ShopPagination } from "@/components/shop/shop-pagination";
import { FormMessage } from "@/components/auth/form-fields";

function formatSize(bytes: number, locale: string) {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${nf.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${nf.format(bytes / 1024)} KB`;
  return `${nf.format(bytes / (1024 * 1024))} MB`;
}

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
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:py-12">
      <PageHeading title={t("title")} subtitle={t("resultCount", { count: total })} />
      {errorCode && <FormMessage tone="error">{t(`errors.${errorCode}`)}</FormMessage>}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-secondary/45 px-4 py-16 text-center">
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

async function OwnedProductCard({ product: p, locale }: { product: OwnedProduct; locale: string }) {
  const t = await getTranslations("downloads");
  const fmt = intlLocale(locale).number;
  const name = localized(locale, p.nameTH, p.nameEN);
  const categoryName = localized(locale, p.categoryNameTH, p.categoryNameEN);

  return (
    <li className="space-y-4 rounded-3xl border p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-secondary/60">
          {p.image ? (
            <Image
              src={previewImageUrl(p.image.imagePath)}
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
        </div>
      </div>

      <div className="space-y-3">
        {p.versions.map((v) => (
          <div key={v.id} className="space-y-1.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              {t("version", { version: v.versionNumber })}
              {v.isLatest && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-normal text-secondary-foreground">
                  {t("latest")}
                </span>
              )}
            </p>
            <ul className="divide-y divide-foreground/10 rounded-2xl bg-secondary/35">
              {v.files.map((f) => {
                const remaining = p.downloadLimit === null ? null : Math.max(0, p.downloadLimit - f.downloadCount);
                const blocked = remaining === 0;
                return (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <FileArchive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate" title={f.fileName}>
                      {f.fileName}
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                      {formatSize(f.fileSize, fmt)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.downloadLimit === null ? t("unlimitedRemaining") : t("remaining", { count: remaining ?? 0 })}
                    </span>
                    {blocked ? (
                      <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                        {t("download")}
                      </span>
                    ) : (
                      <a
                        href={`/api/download/${f.id}?locale=${locale}`}
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80"
                      >
                        <DownloadIcon className="size-3.5" aria-hidden /> {t("download")}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </li>
  );
}
