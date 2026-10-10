import { PreviewImage } from "@/components/shared/preview-image";
import type { BannerTheme } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";

/** One carousel card's display data, already localized. */
export type BannerCardData = {
  id: string;
  title: string;
  tag: string | null;
  cta: string | null;
  theme: BannerTheme;
  imageUrl: string | null;
  focusX: number;
  focusY: number;
};

/**
 * The look of a home-page banner card (pastel fill, picture on the right fading under the text).
 * Shared by the storefront carousel and the admin editor's live preview. Pure markup: links and
 * motion belong to the caller.
 */
export function BannerCard({ banner, priority = false, className }: { banner: BannerCardData; priority?: boolean; className?: string }) {
  return (
    <div data-banner-theme={banner.theme} className={cn("banner-card relative isolate h-full w-full overflow-hidden", className)}>
      {banner.imageUrl && (
        <PreviewImage
          src={banner.imageUrl}
          alt=""
          fill
          priority={priority}
          sizes="(max-width: 640px) 78vw, 920px"
          className="banner-card-image object-cover"
          style={{ objectPosition: `${banner.focusX}% ${banner.focusY}%` }}
          draggable={false}
        />
      )}
      <div aria-hidden className={cn("banner-card-frost absolute inset-0", !banner.imageUrl && "hidden")} />
      <div className="relative z-10 flex h-full max-w-[62%] flex-col items-start justify-center px-[clamp(1.25rem,5vw,4.5rem)] sm:max-w-[56%]">
        {banner.tag && (
          <span className="mb-[clamp(0.5rem,1.2vw,0.875rem)] rounded-full bg-background/70 px-3 py-1 text-[clamp(0.6875rem,1.1vw,0.8125rem)] font-medium text-foreground">
            {banner.tag}
          </span>
        )}
        <p className="font-heading text-[clamp(1.125rem,3vw,2.5rem)] leading-[1.22] font-semibold tracking-tight whitespace-pre-line text-[var(--banner-ink)]">
          {banner.title}
        </p>
        {banner.cta && (
          <span className="mt-[clamp(0.75rem,1.8vw,1.5rem)] inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[clamp(0.75rem,1.2vw,0.9375rem)] font-medium text-background sm:px-5">
            {banner.cta}
            <span aria-hidden className="size-1.5 rotate-45 border-t-[1.6px] border-r-[1.6px] border-current" />
          </span>
        )}
      </div>
    </div>
  );
}
