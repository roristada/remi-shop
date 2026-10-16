import type { Metadata } from "next";
import { PreviewImage } from "@/components/shared/preview-image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download as DownloadIcon, LayoutGrid, List } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localize";
import { requireUser } from "@/lib/auth/guards";
import { listOwnedProducts, type OwnedProduct } from "@/lib/downloads/queries";
import { previewImageSrc } from "@/lib/storage/public-url";
import { PageHeading } from "@/components/shop/page-heading";
import { ShopPagination } from "@/components/shop/shop-pagination";
import { FormMessage } from "@/components/auth/form-fields";
import { DownloadVersions } from "@/components/downloads/download-versions";
import {
  BulkDownloadProvider,
  BulkSelectCheckbox,
  ProductDownloadAll,
  type BulkItem,
} from "@/components/downloads/bulk-download";
import { bulkDownloadFileIds } from "@/lib/downloads/rules";
import { cn } from "@/lib/utils";

const ERROR_CODES = ["not_found", "forbidden", "limit_reached", "error"] as const;

type View = "list" | "gallery";
const VIEWS: { value: View; icon: typeof List }[] = [
  { value: "list", icon: List },
  { value: "gallery", icon: LayoutGrid },
];

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
  const view: View = sp.view === "gallery" ? "gallery" : "list";
  const viewParams = view === "gallery" ? { view } : {};

  const [t, { items, total, pageCount }] = await Promise.all([
    getTranslations("downloads"),
    listOwnedProducts(user.id, page),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading title={t("title")} subtitle={t("resultCount", { count: total })} />
        {items.length > 0 && (
          <nav aria-label={t("view.label")} className="flex rounded-full border p-0.5">
            {VIEWS.map(({ value, icon: Icon }) => (
              <Link
                key={value}
                href={value === "gallery" ? { pathname: "/downloads", query: { view: value } } : "/downloads"}
                aria-current={view === value ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm text-muted-foreground hover:text-foreground",
                  view === value && "bg-secondary font-medium text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden /> {t(`view.${value}`)}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {errorCode && <FormMessage tone="error">{t(`errors.${errorCode}`)}</FormMessage>}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-background/80 px-4 py-16 text-center">
          <DownloadIcon className="size-6 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("empty")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <BulkDownloadProvider
          items={items.map((p): BulkItem => ({ id: p.productId, fileIds: bulkDownloadFileIds(p.versions, p.downloadLimit) }))}
          locale={locale}
        >
          {view === "gallery" ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              {items.map((p) => (
                <OwnedProductTile key={p.productId} product={p} locale={locale} />
              ))}
            </ul>
          ) : (
            <ul className="space-y-4">
              {items.map((p) => (
                <OwnedProductCard
                  key={p.productId}
                  product={p}
                  locale={locale}
                  selectLabel={t("bulk.selectProduct", { name: localized(locale, p.nameTH, p.nameEN) })}
                />
              ))}
            </ul>
          )}
        </BulkDownloadProvider>
      )}
      <ShopPagination page={page} pageCount={pageCount} params={viewParams} path="/downloads" />
    </div>
  );
}

/** Gallery tile: every tile is the same size (square picture, one-line name, file count + download-all button). */
function OwnedProductTile({ product: p, locale }: { product: OwnedProduct; locale: string }) {
  const name = localized(locale, p.nameTH, p.nameEN);
  const latest = p.versions.find((v) => v.isLatest) ?? p.versions[0];

  return (
    <li className="flex flex-col overflow-hidden rounded-3xl border bg-background">
      <Link href={`/product/${p.slug}`} className="relative block aspect-square bg-secondary/60" tabIndex={-1} aria-hidden>
        {p.image && (
          <PreviewImage
            src={previewImageSrc(p.image, "card")}
            alt=""
            fill
            sizes="(min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        )}
      </Link>
      <div className="space-y-1.5 p-3 sm:p-4">
        <Link href={`/product/${p.slug}`} className="block truncate font-semibold hover:underline" title={name}>
          {name}
        </Link>
        <ProductDownloadAll
          fileIds={bulkDownloadFileIds(p.versions, p.downloadLimit)}
          fileCount={latest?.files.length ?? 0}
          locale={locale}
          name={name}
        />
      </div>
    </li>
  );
}

function OwnedProductCard({
  product: p,
  locale,
  selectLabel,
}: {
  product: OwnedProduct;
  locale: string;
  selectLabel: string;
}) {
  const name = localized(locale, p.nameTH, p.nameEN);
  const categoryName = localized(locale, p.categoryNameTH, p.categoryNameEN);

  return (
    <li className="space-y-4 rounded-3xl border p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <BulkSelectCheckbox
          id={p.productId}
          label={selectLabel}
          disabled={bulkDownloadFileIds(p.versions, p.downloadLimit).length === 0}
        />
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
