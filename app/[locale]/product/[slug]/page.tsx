import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localize";
import { publicEnv } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/guards";
import { getPurchaseOptions } from "@/lib/cart/queries";
import { calculateProductPrice, fromHundredths } from "@/lib/pricing/calculate";
import { getProductStatus } from "@/lib/products/status";
import { isSoldOut } from "@/lib/products/stock";
import { schemaAvailability } from "@/lib/products/storefront";
import {
  getShopProduct,
  listRelatedProducts,
  releasedVersions,
  type ShopProduct,
} from "@/lib/products/storefront-queries";
import { previewImageUrl } from "@/lib/storage/public-url";
import { ProductGallery } from "@/components/shop/product-gallery";
import { PurchasePanel } from "@/components/shop/purchase-panel";
import { FileList } from "@/components/shop/file-list";
import { VersionHistory } from "@/components/shop/version-history";
import { ProductGrid } from "@/components/shop/product-grid";
import { LicenseOfferPanel } from "@/components/shop/license-offer";
import { getLicenseOffers } from "@/lib/licenses/queries";
import { StarRating } from "@/components/shop/star-rating";
import { ReviewSection } from "@/components/reviews/review-section";
import { ratingAverage } from "@/lib/reviews/rules";
import { WishlistButton } from "@/components/shop/wishlist-button";
import { isWishlisted } from "@/lib/wishlist/queries";

/** Published product in a visible category, or null. */
async function loadProduct(slug: string): Promise<ShopProduct | null> {
  const product = await getShopProduct(slug);
  return product && product.category.status === "ACTIVE" ? product : null;
}

function plainExcerpt(text: string, max = 160) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/product/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  const name = localized(locale, product.nameTH, product.nameEN);
  const title = localized(locale, product.seoTitleTH, product.seoTitleEN) || name;
  const description =
    localized(locale, product.metaDescriptionTH, product.metaDescriptionEN) ||
    plainExcerpt(localized(locale, product.descriptionTH, product.descriptionEN)) ||
    undefined;
  const path = `/product/${product.slug}`;
  const image = product.images[0];

  return {
    title,
    description,
    alternates: { canonical: `/${locale}${path}`, languages: { th: `/th${path}`, en: `/en${path}` } },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/${locale}${path}`,
      locale: locale === "en" ? "en_US" : "th_TH",
      images: image
        ? [{ url: previewImageUrl(image.imagePath), alt: localized(locale, image.altTextTH, image.altTextEN) || name }]
        : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/[locale]/product/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  await connection(); // Price, discount and sale state depend on the current time.

  const product = await loadProduct(slug);
  if (!product) notFound();

  const t = await getTranslations("shop.product");
  const now = new Date();
  const price = calculateProductPrice(product, now);
  const status = getProductStatus(product, now);
  const versions = releasedVersions(product.versions);
  const latest = versions.find((v) => v.isLatest);

  const name = localized(locale, product.nameTH, product.nameEN);
  const description = localized(locale, product.descriptionTH, product.descriptionEN);
  const requirements = localized(locale, product.requirementsTH, product.requirementsEN);
  const categoryName = localized(locale, product.category.nameTH, product.category.nameEN);
  const images = product.images.map((img) => ({
    id: img.id,
    url: previewImageUrl(img.imagePath),
    alt: localized(locale, img.altTextTH, img.altTextEN) || name,
  }));

  const user = await getCurrentUser();
  const userId = user?.id ?? null;
  const [related, licenseOffers] = await Promise.all([
    listRelatedProducts(product.categoryId, product.id, locale, now, 4, userId),
    // A license can be requested only while the product is on sale.
    status === "ACTIVE" ? getLicenseOffers(product.id) : Promise.resolve([]),
  ]);
  const purchaseOptions = await getPurchaseOptions(userId, product.id, locale, now);
  const wishlisted = userId ? await isWishlisted(userId, product.id) : false;

  const details = [
    { label: t("software"), value: product.softwareTags.map((st) => st.softwareTag.name).join(", ") || null },
    { label: t("supportedVersion"), value: product.supportedVersion },
    { label: t("fileFormat"), value: product.fileFormat },
    { label: t("license"), value: product.license },
    { label: t("currentVersion"), value: latest ? `v${latest.versionNumber}` : null },
    {
      label: t("downloadLimit"),
      value: product.downloadLimit === null ? t("unlimited") : t("times", { count: product.downloadLimit }),
    },
  ].filter((d): d is { label: string; value: string } => Boolean(d.value));

  const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: plainExcerpt(description, 500) || undefined,
    image: images.map((i) => i.url),
    sku: product.id,
    category: categoryName,
    url: `${siteUrl}/${locale}/product/${product.slug}`,
    offers: {
      "@type": "Offer",
      price: fromHundredths(price.finalPrice),
      priceCurrency: "THB",
      availability: schemaAvailability(status, purchaseOptions.length > 0 && purchaseOptions.every((o) => isSoldOut(o.stock))),
      url: `${siteUrl}/${locale}/product/${product.slug}`,
      ...(price.discountEndsAt ? { priceValidUntil: price.discountEndsAt.toISOString().slice(0, 10) } : {}),
    },
  };

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:py-10">
      <script
        type="application/ld+json"
        // JSON.stringify does not escape "<"; replace it so product text cannot close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <nav aria-label={t("breadcrumb")}>
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href="/" className="hover:text-foreground hover:underline">
              {t("home")}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li>
            <Link href={`/category/${product.category.slug}`} className="hover:text-foreground hover:underline">
              {categoryName}
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li aria-current="page" className="max-w-[16rem] truncate text-foreground">
            {name}
          </li>
        </ol>
      </nav>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-10">
        <ProductGallery images={images} />

        <div className="space-y-5">
          <div className="space-y-2">
            <Link
              href={`/category/${product.category.slug}`}
              className="text-sm font-medium text-brand-strong hover:underline"
            >
              {categoryName}
            </Link>
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-sans text-2xl leading-snug font-semibold text-balance sm:text-[2rem]">{name}</h1>
              <WishlistButton productId={product.id} productSlug={product.slug} initialWishlisted={wishlisted} />
            </div>
            <StarRating average={ratingAverage(product.ratingSum, product.ratingCount)} count={product.ratingCount} />
          </div>

          <PurchasePanel
            price={price}
            status={status}
            saleStartAt={product.saleStartAt}
            saleEndAt={product.saleEndAt}
            now={now}
            product={{ id: product.id, slug: product.slug }}
            options={purchaseOptions}
          />

          {details.length > 0 && (
            <section aria-labelledby="details-heading" className="space-y-3">
              <h2 id="details-heading" className="text-lg">
                {t("details")}
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                {details.map((d) => (
                  <div key={d.label} className="contents">
                    <dt className="text-muted-foreground">{d.label}</dt>
                    <dd className="font-medium break-words">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {latest && latest.files.length > 0 && (
            <FileList
              files={latest.files.map((f) => ({
                id: f.id,
                fileName: f.fileName,
                fileSize: f.fileSize,
                variantName: f.variant ? localized(locale, f.variant.nameTH, f.variant.nameEN) : null,
              }))}
            />
          )}

          {licenseOffers.length > 0 && <LicenseOfferPanel offers={licenseOffers} productSlug={product.slug} />}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section aria-labelledby="description-heading" className="space-y-3">
          <h2 id="description-heading" className="text-xl">
            {t("description")}
          </h2>
          <div className="text-base leading-relaxed whitespace-pre-line">
            {description || <span className="text-muted-foreground">{t("noDescription")}</span>}
          </div>
          {requirements && (
            <div className="space-y-1 pt-2">
              <h3>{t("requirements")}</h3>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{requirements}</p>
            </div>
          )}
        </section>

        {versions.length > 0 && (
          <section aria-labelledby="versions-heading" className="space-y-4">
            <h2 id="versions-heading" className="text-xl">
              {t("versions")}
            </h2>
            <VersionHistory versions={versions} />
          </section>
        )}
      </div>

      <ReviewSection productId={product.id} productName={name} productSlug={product.slug} />

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="space-y-4">
          <h2 id="related-heading" className="text-xl">
            {t("related")}
          </h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  );
}
