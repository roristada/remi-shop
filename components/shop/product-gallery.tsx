"use client";

import { useState } from "react";
import { PreviewImage } from "@/components/shared/preview-image";
import { useTranslations } from "next-intl";
import { Expand, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSelectedVariant } from "./selected-variant";

/** `url` is the page-size copy; `fullUrl` (when set) the original for the full-size view. */
export type GalleryImage = { id: string; url: string; alt: string; fullUrl?: string };

/**
 * Product pictures. With `variantImages`, choosing an option in the purchase panel shows that
 * option's picture first.
 */
export function ProductGallery({
  images: productImages,
  variantImages = {},
}: {
  images: GalleryImage[];
  variantImages?: Record<string, GalleryImage>;
}) {
  const t = useTranslations("shop.product");
  const selectedId = useSelectedVariant()?.selectedId ?? null;
  const variantImage = selectedId ? variantImages[selectedId] : undefined;
  const images = variantImage ? [variantImage, ...productImages] : productImages;
  const [picked, setPicked] = useState<{ index: number; variant: string | undefined }>({ index: 0, variant: undefined });
  // A newly chosen option jumps back to its own picture.
  const active = picked.variant === variantImage?.id ? picked.index : 0;
  const setActive = (index: number) => setPicked({ index, variant: variantImage?.id });
  const current = images[active] ?? images[0];

  if (!current) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-3xl bg-secondary/50 text-sm text-muted-foreground">
        <span className="flex flex-col items-center gap-2">
          <ImageOff className="size-6" aria-hidden />
          {t("noImage")}
        </span>
      </div>
    );
  }

  return (
    <section aria-label={t("gallery")} className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-secondary/50">
        <PreviewImage
          key={current.id}
          src={current.url}
          alt={current.alt}
          fill
          loading="eager"
          fetchPriority={active === 0 ? "high" : "auto"}
          sizes="(min-width: 1024px) 560px, 100vw"
          className="object-contain animate-in fade-in-0 duration-200 motion-reduce:animate-none"
        />
        {current.fullUrl && (
          <a
            href={current.fullUrl}
            target="_blank"
            rel="noopener"
            className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium shadow-soft backdrop-blur hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Expand className="size-3.5" aria-hidden /> {t("fullSize")}
          </a>
        )}
      </div>
      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2">
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={t("showImage", { index: i + 1 })}
                aria-current={i === active ? "true" : undefined}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-xl border-2 bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  i === active ? "border-brand-strong" : "border-transparent hover:border-border",
                )}
              >
                <PreviewImage src={img.url} alt="" fill sizes="100px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
