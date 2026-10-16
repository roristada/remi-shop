import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PreviewImage } from "@/components/shared/preview-image";
import { resolveIconKey, type CategoryIconKey } from "@/lib/categories/icons";

// Hand-drawn REMI category icons: pastel fills with one soft ink outline (round caps and joins), drawn on a 48×48 grid.
// Colours come from the banner presets so the icons sit with the rest of the storefront.
const INK = "#333333";
const PINK = "#f6bfd4";
const SKY = "#bfe9f7";
const BUTTER = "#fff0b8";
const LILAC = "#e4d9fb";
const PAPER = "#ffffff";
const BRAND = "#b0426b";
const MINT = "#c8ecd8";

export type CategoryTone =
  "pink" | "sky" | "lilac" | "mint" | "butter" | "neutral";

type Art = { tone: CategoryTone; art: ReactNode };

const BRUSH: Art = {
  tone: "pink",
  art: (
    <>
      <g className="cat-brush">
        <g transform="rotate(40 24 24)">
          <rect x="20.5" y="24" width="7" height="18" rx="3.5" fill={BUTTER} />
          <rect x="19.5" y="17" width="9" height="8" rx="1.5" fill={SKY} />
          <path d="M19.5 21h9" />
          <path
            d="M19.5 17C19.5 11 22 6.5 24 4c2 2.5 4.5 7 4.5 13z"
            fill={PINK}
          />
        </g>
      </g>
      <path
        className="cat-paint"
        d="M26 42c3-2.2 6 1.2 9.5-1s4.5-.5 6 .5"
        stroke={BRAND}
        strokeWidth="2.5"
      />
    </>
  ),
};

const BASE: Art = {
  tone: "sky",
  art: (
    <>
      {/* A figure blocked in as a sketch: head with the classic face guide lines, body still a dashed draft. */}
      <path
        d="M11.5 43c0-7.5 5.2-12 12.5-12s12.5 4.5 12.5 12z"
        fill={PAPER}
        strokeDasharray="3.2 2.6"
        className="cat-dash"
      />
      <circle cx="24" cy="17" r="9.5" fill={PINK} />
      <path
        d="M24 7.5v19M14.7 18.2c5.9 3 12.7 3 18.6 0"
        strokeDasharray="2 2.4"
        strokeWidth="1.6"
      />
    </>
  ),
};

const TEMPLATE: Art = {
  tone: "mint",
  art: (
    <>
      <rect x="6" y="8" width="36" height="32" rx="5" fill={PAPER} />
      <path
        d="M6 13a5 5 0 0 1 5-5h26a5 5 0 0 1 5 5v3H6z"
        fill={PINK}
        stroke="none"
      />
      <rect x="6" y="8" width="36" height="32" rx="5" />
      <path d="M6 16h36" />
      <circle cx="11" cy="12" r="1.1" fill={INK} stroke="none" />
      <circle cx="15" cy="12" r="1.1" fill={INK} stroke="none" />
      <g className="cat-lift">
        <rect x="11" y="20.5" width="14" height="14" rx="2.5" fill={SKY} />
        <circle cx="21" cy="24.6" r="1.6" fill={BUTTER} strokeWidth="1.4" />
        <path d="m11.5 32 4.5-4.6 3.5 3.5 2-2 3.5 3.6" strokeWidth="1.8" />
      </g>
      <path d="M29.5 22.5h8M29.5 27.5h8M29.5 32.5h5" />
    </>
  ),
};

const STICKER: Art = {
  tone: "butter",
  art: (
    <>
      <path
        d="M17 7h14a10 10 0 0 1 10 10v12L29 41H17A10 10 0 0 1 7 31V17A10 10 0 0 1 17 7z"
        fill={PAPER}
      />
      <path className="cat-peel" d="M41 29h-8a4 4 0 0 0-4 4v8z" fill={PINK} />
      <path d="M15.5 21.5q2.2-2.8 4.4 0M28.1 21.5q2.2-2.8 4.4 0" />
      <path d="M20 26.5q4 4 8 0" />
      <ellipse
        cx="14.6"
        cy="26.4"
        rx="2.3"
        ry="1.4"
        fill={PINK}
        stroke="none"
      />
      <ellipse
        cx="33.4"
        cy="26.4"
        rx="2.3"
        ry="1.4"
        fill={PINK}
        stroke="none"
      />
    </>
  ),
};

const ASSETS: Art = {
  tone: "lilac",
  art: (
    <>
      <path
        className="cat-bob"
        d="M15 21.5s-7.2-4.3-7.2-9.2a3.9 3.9 0 0 1 7.2-2.1 3.9 3.9 0 0 1 7.2 2.1c0 4.9-7.2 9.2-7.2 9.2z"
        fill={PINK}
      />
      <path
        className="cat-bob"
        style={{ "--d": "60ms" } as CSSProperties}
        d="M33 7l2 4.75 5.13.43-3.9 3.37 1.18 5.02L33 17.9l-4.41 2.67 1.18-5.02-3.9-3.37 5.13-.43z"
        fill={BUTTER}
      />
      <circle
        className="cat-bob"
        style={{ "--d": "120ms" } as CSSProperties}
        cx="15"
        cy="33"
        r="7"
        fill={SKY}
      />
      <path
        className="cat-bob"
        style={{ "--d": "180ms" } as CSSProperties}
        d="M33 26.5 40.5 39h-15z"
        fill={LILAC}
      />
    </>
  ),
};

const FALLBACK: Art = {
  tone: "neutral",
  art: (
    <>
      <path
        d="M13 6h15l9 9v25a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z"
        fill={PAPER}
      />
      <path d="M28 6v7a2 2 0 0 0 2 2h7" fill={PINK} />
      <path
        className="cat-spark"
        d="M23.5 22.5c.6 3.2 1.8 4.4 5 5-3.2.6-4.4 1.8-5 5-.6-3.2-1.8-4.4-5-5 3.2-.6 4.4-1.8 5-5z"
        fill={BUTTER}
      />
    </>
  ),
};

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

const TEXTURE: Art = {
  tone: "sky",
  art: (
    <>
      <rect x="8" y="8" width="32" height="32" rx="6" fill={PAPER} />
      <g className="cat-lift" strokeLinecap="butt">
        <path d="M8 20 20 8M12 40 40 12" stroke={PINK} strokeWidth="4" />
        <path d="M8 32 32 8M24 40 40 24" stroke={SKY} strokeWidth="4" />
      </g>
      <rect x="8" y="8" width="32" height="32" rx="6" />
    </>
  ),
};

const FONT: Art = {
  tone: "pink",
  art: (
    <>
      <g className="cat-bob">
        <path d="M7 39 16.2 11h1.6L27 39M10.6 29.5h12.8" strokeWidth="2.6" />
      </g>
      <g className="cat-bob" style={d(90)}>
        <circle cx="35" cy="32.5" r="6" fill={PINK} />
        <path d="M41 25v14" strokeWidth="2.6" />
      </g>
    </>
  ),
};

const PALETTE: Art = {
  tone: "butter",
  art: (
    <>
      <path
        d="M24 7C13.5 7 6 14.5 6 24s7.5 17 16.5 17c2.9 0 4-2 3.1-4.2-1-2.5.6-4.8 3.3-4.8H34c5 0 8-3.5 8-8C42 14 34 7 24 7z"
        fill={PAPER}
      />
      <circle className="cat-bob" cx="15" cy="21" r="3.2" fill={PINK} />
      <circle
        className="cat-bob"
        style={d(60)}
        cx="22.5"
        cy="14"
        r="3.2"
        fill={SKY}
      />
      <circle
        className="cat-bob"
        style={d(120)}
        cx="31.5"
        cy="15.5"
        r="3.2"
        fill={BUTTER}
      />
      <circle
        className="cat-bob"
        style={d(180)}
        cx="15.5"
        cy="31"
        r="3.2"
        fill={LILAC}
      />
    </>
  ),
};

const FRAME: Art = {
  tone: "lilac",
  art: (
    <>
      <rect x="7" y="9" width="34" height="30" rx="3" fill={BUTTER} />
      <rect x="13" y="15" width="22" height="18" rx="2" fill={PAPER} />
      <circle cx="7.5" cy="9.5" r="2.4" fill={PAPER} />
      <circle cx="40.5" cy="9.5" r="2.4" fill={PAPER} />
      <circle cx="7.5" cy="38.5" r="2.4" fill={PAPER} />
      <circle cx="40.5" cy="38.5" r="2.4" fill={PAPER} />
      <path
        className="cat-spark"
        d="M24 29s-5.2-3.1-5.2-6.6a2.8 2.8 0 0 1 5.2-1.5 2.8 2.8 0 0 1 5.2 1.5c0 3.5-5.2 6.6-5.2 6.6z"
        fill={PINK}
        strokeWidth="1.8"
      />
    </>
  ),
};

const BACKGROUND: Art = {
  tone: "sky",
  art: (
    <>
      <rect
        x="6"
        y="8"
        width="36"
        height="32"
        rx="5"
        fill={SKY}
        stroke="none"
      />
      <circle className="cat-bob" cx="32" cy="17.5" r="4" fill={BUTTER} />
      <path
        d="M6 35 16 23.5l8 9 5-5 13 7.5a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5z"
        fill={MINT}
      />
      <rect x="6" y="8" width="36" height="32" rx="5" />
    </>
  ),
};

const MODEL: Art = {
  tone: "lilac",
  art: (
    <g className="cat-lift">
      <path d="M24 6 39 14.5v19L24 42 9 33.5v-19z" fill={LILAC} />
      <path d="M24 6 39 14.5 24 23 9 14.5z" fill={PAPER} />
      <path d="M24 23v19" />
    </g>
  ),
};

const BUBBLE: Art = {
  tone: "mint",
  art: (
    <g className="cat-brush">
      <path
        d="M11 9h26a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H23l-8.5 7v-7H11a5 5 0 0 1-5-5V14a5 5 0 0 1 5-5z"
        fill={PAPER}
      />
      <circle
        className="cat-bob"
        cx="16.5"
        cy="21"
        r="2.2"
        fill={INK}
        stroke="none"
      />
      <circle
        className="cat-bob"
        style={d(80)}
        cx="24"
        cy="21"
        r="2.2"
        fill={INK}
        stroke="none"
      />
      <circle
        className="cat-bob"
        style={d(160)}
        cx="31.5"
        cy="21"
        r="2.2"
        fill={INK}
        stroke="none"
      />
    </g>
  ),
};

const BUNDLE: Art = {
  tone: "pink",
  art: (
    <>
      <rect x="9" y="21" width="30" height="19" rx="3" fill={PINK} />
      <path d="M24 22v18" />
      <g className="cat-lift">
        <rect x="7" y="14" width="34" height="8" rx="2.5" fill={PAPER} />
        <path d="M24 14v8" />
        <path
          d="M24 14c-2-5-8.5-6-8.5-2.4S21 14 24 14zm0 0c2-5 8.5-6 8.5-2.4S27 14 24 14z"
          fill={BUTTER}
        />
      </g>
    </>
  ),
};

const ARTS: Record<CategoryIconKey, Art> = {
  brush: BRUSH,
  base: BASE,
  template: TEMPLATE,
  sticker: STICKER,
  assets: ASSETS,
  texture: TEXTURE,
  font: FONT,
  palette: PALETTE,
  frame: FRAME,
  background: BACKGROUND,
  model: MODEL,
  bubble: BUBBLE,
  bundle: BUNDLE,
  file: FALLBACK,
};

/**
 * A category's icon on its pastel tile: an uploaded picture when there is one, else the drawn icon
 * the admin picked (or the one guessed from the slug). Decorative: the visible name labels it.
 */
export function CategoryIcon({
  slug,
  iconKey,
  imageUrl,
  className,
}: {
  slug: string;
  iconKey?: string | null;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <span
        data-tone="neutral"
        className={cn(
          "category-tile relative grid place-items-center overflow-hidden",
          className,
        )}
      >
        <PreviewImage
          src={imageUrl}
          alt=""
          fill
          sizes="80px"
          className="object-cover"
        />
      </span>
    );
  }
  const { tone, art } = ARTS[resolveIconKey(iconKey, slug)];
  return (
    <span
      data-tone={tone}
      className={cn("category-tile grid place-items-center", className)}
    >
      <svg
        viewBox="0 0 48 48"
        aria-hidden
        className="size-[62%]"
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {art}
      </svg>
    </span>
  );
}
