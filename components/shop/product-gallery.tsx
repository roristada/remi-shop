"use client";

import { useState } from "react";
import { PreviewImage } from "@/components/shared/preview-image";
import { useTranslations } from "next-intl";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type GalleryImage = { id: string; url: string; alt: string };

export function ProductGallery({ images }: { images: GalleryImage[] }) {
  const t = useTranslations("shop.product");
  const [active, setActive] = useState(0);
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
