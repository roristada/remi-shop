import { PreviewImage } from "@/components/shared/preview-image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ProductCardData } from "@/lib/products/storefront-queries";

type Props = {
  /** Real, currently-listed products to show when no banner is live. */
  fallbackProducts: ProductCardData[];
};

/**
 * Home-page panel shown only while no banner is live (live banners go to `BannerCarousel` at the
 * top): a plain rotation of real product previews. Never a fabricated discount or "sale" claim.
 */
export async function BannerSlot({ fallbackProducts }: Props) {
  const t = await getTranslations("home.banner");

  const images = fallbackProducts.filter((p) => p.image).slice(0, 3);
  if (images.length === 0) return null;

  return (
    <section aria-label={t("label")} className="rounded-3xl bg-background/80 p-6 sm:p-8">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:gap-8">
        <ul className="grid w-full shrink-0 grid-cols-3 gap-2 sm:w-72">
          {images.map((p) => (
            <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-background">
              {/* Decorative collage; the product name is already stated in the caption below. */}
              <PreviewImage src={p.image!.url} alt="" fill sizes="96px" className="object-cover" />
            </li>
          ))}
        </ul>
        <div className="space-y-3">
          <h2 className="text-xl sm:text-2xl">{t("fallbackTitle")}</h2>
          <p className="max-w-prose text-foreground/80">{t("fallbackBody")}</p>
          <Link
            href="/shop"
            className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-medium text-foreground hover:bg-primary/85"
          >
            {t("fallbackCta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
