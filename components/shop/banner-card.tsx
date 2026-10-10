import type { CSSProperties } from "react";
import { PreviewImage } from "@/components/shared/preview-image";
import type { BannerTheme } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { cardBlurLayers, fadeStyle, inkFor, type FadeDirection } from "@/lib/banners/look";

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
  /** Percent, 100 = the picture just covers the card. */
  zoom: number;
  /** Custom fill (#rrggbb); null = the theme colour. */
  bgColor: string | null;
  fadeDirection: FadeDirection;
  /** 0–100. */
  fadeStrength: number;
  /** Blend the fill colour into the picture. */
  tintImage: boolean;
  /** Blur of the picture behind the text, 0–100. */
  textBlur: number;
  /** Blur the whole picture, easing off left to right (never fully sharp). */
  fullBlur: boolean;
};

/**
 * The look of a home-page banner card (pastel fill, picture on the right fading under the text).
 * Shared by the storefront carousel and the admin editor's live preview. Pure markup: links and
 * motion belong to the caller.
 */
export function BannerCard({ banner, priority = false, className }: { banner: BannerCardData; priority?: boolean; className?: string }) {
  const fade = fadeStyle("var(--banner-bg)", banner.fadeDirection, banner.fadeStrength);
  const blurLayers = cardBlurLayers(banner.textBlur, banner.fullBlur);
  const scale = Math.max(banner.zoom, 100) / 100;
  // Shared by the sharp picture and its blurred copy so both crop identically.
  const picture = banner.imageUrl
    ? {
        src: banner.imageUrl,
        alt: "",
        fill: true,
        sizes: "(max-width: 640px) 78vw, 920px",
        className: "banner-card-image object-cover",
        "data-tint": banner.tintImage ? undefined : "off",
        draggable: false,
      }
    : null;
  // Position picks the part of a picture that overflows the card; zooming in around the same
  // point makes the other axis overflow too, so both sliders always do something.
  const framing = (extraScale = 1): CSSProperties => ({
    objectPosition: `${banner.focusX}% ${banner.focusY}%`,
    transform: scale * extraScale > 1 ? `scale(${scale * extraScale})` : undefined,
    transformOrigin: `${banner.focusX}% ${banner.focusY}%`,
  });
  return (
    <div
      data-banner-theme={banner.theme}
      className={cn("banner-card relative isolate h-full w-full overflow-hidden", className)}
      // A custom colour wins over the theme (in both site themes); the text ink follows its lightness.
      style={banner.bgColor ? ({ "--banner-bg": banner.bgColor, "--banner-ink": inkFor(banner.bgColor) } as CSSProperties) : undefined}
    >
      {picture && <PreviewImage {...picture} priority={priority} style={framing()} />}
      {/* Progressive text-side blur (see textBlurLayers): blurred copies of the picture on their own
          fill, strongest at the far left. Not a backdrop-filter, which blanks multiply-tinted
          pictures in Chrome. Scaled up a touch so a blur's soft edge never shows the fill. */}
      {picture &&
        blurLayers.map((layer, i) => (
          <div
            key={i}
            aria-hidden
            className="absolute inset-0 isolate overflow-hidden bg-[var(--banner-bg)]"
            style={{ maskImage: layer.mask, WebkitMaskImage: layer.mask }}
          >
            <PreviewImage {...picture} style={{ ...framing(1.08), filter: `blur(${layer.px}px)` }} />
          </div>
        ))}
      {banner.imageUrl && fade && <div aria-hidden className="banner-card-frost absolute inset-0" style={fade} />}
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
          <span className="mt-[clamp(0.75rem,1.8vw,1.5rem)] inline-flex items-center gap-2 rounded-full bg-[var(--banner-ink)] px-4 py-2 text-[clamp(0.75rem,1.2vw,0.9375rem)] font-medium text-[var(--banner-bg)] sm:px-5">
            {banner.cta}
            <span aria-hidden className="size-1.5 rotate-45 border-t-[1.6px] border-r-[1.6px] border-current" />
          </span>
        )}
      </div>
    </div>
  );
}
