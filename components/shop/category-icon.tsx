import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Hand-drawn REMI category icons: pastel fills with one soft ink outline (round caps and joins), drawn on a 48×48 grid.
// Colours come from the banner presets so the icons sit with the rest of the storefront.
const INK = "#333333";
const PINK = "#f6bfd4";
const SKY = "#bfe9f7";
const BUTTER = "#fff0b8";
const LILAC = "#e4d9fb";
const PAPER = "#ffffff";
const BRAND = "#b0426b";

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

// Matched on the slug, so a renamed category keeps its icon; a new kind of category gets the generic file.
const MATCHERS: [RegExp, Art][] = [
  [/brush/, BRUSH],
  [/base/, BASE],
  [/template|layout/, TEMPLATE],
  [/sticker|emote/, STICKER],
  [/asset|element/, ASSETS],
];

function artFor(slug: string): Art {
  return MATCHERS.find(([re]) => re.test(slug))?.[1] ?? FALLBACK;
}

/** A category's illustrated icon on its pastel tile. Decorative: the visible name labels it. */
export function CategoryIcon({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const { tone, art } = artFor(slug);
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
