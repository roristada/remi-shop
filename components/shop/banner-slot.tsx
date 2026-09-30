import { PreviewImage } from "@/components/shared/preview-image";
import { ImageOff } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localize";
import { previewImageUrl } from "@/lib/storage/public-url";
import type { getActiveAnnouncement, ProductCardData } from "@/lib/products/storefront-queries";

type Announcement = NonNullable<Awaited<ReturnType<typeof getActiveAnnouncement>>>;

type Props = {
  announcement: Announcement | null;
  /** Real, currently-listed products to fall back to when no announcement is live. */
  fallbackProducts: ProductCardData[];
};

/**
 * The one bounded banner slot on the home page (DESIGN.md § Banner / Announcement Slot):
 * an admin-authored announcement when one is live, otherwise a plain rotation of real product
 * previews. Never a fabricated discount or "sale" claim — only what the data actually says.
 */
export async function BannerSlot({ announcement, fallbackProducts }: Props) {
  const [t, locale] = await Promise.all([getTranslations("home.banner"), getLocale()]);

  if (announcement) {
    const title = localized(locale, announcement.titleTH, announcement.titleEN);
    const description = localized(locale, announcement.descriptionTH, announcement.descriptionEN);
    const content = (
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-8">
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-2xl bg-background sm:w-72">
          {announcement.imagePath ? (
            <PreviewImage src={previewImageUrl(announcement.imagePath)} alt="" fill sizes="288px" className="object-cover" />
          ) : (
            <ImageOff className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl">{title}</h2>
          {description && <p className="max-w-prose text-foreground/80">{description}</p>}
        </div>
      </div>
    );
    return (
      <section aria-label={t("label")} className="rounded-3xl bg-background/80 p-6 sm:p-8">
        {announcement.link ? (
          <Link href={announcement.link} className="block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {content}
          </Link>
        ) : (
          content
        )}
      </section>
    );
  }

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
