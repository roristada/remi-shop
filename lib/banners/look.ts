// Pure banner-card styling (no React): fill colour, readable ink, and the colour fade over the
// picture. Shared by the storefront carousel and the admin preview, so both look identical.

export const FADE_DIRECTIONS = ["LEFT", "RIGHT", "TOP", "BOTTOM", "NONE"] as const;
export type FadeDirection = (typeof FADE_DIRECTIONS)[number];

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Ink for text on a fill: dark on light colours, white on dark ones (WCAG relative luminance). */
export function inkFor(hex: string): "#2a1f2d" | "#ffffff" {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast against dark ink (#2a1f2d, L≈0.017) vs white: pick whichever is higher.
  return (lum + 0.05) / 0.067 >= 1.05 / (lum + 0.05) ? "#2a1f2d" : "#ffffff";
}

const TOWARD: Record<Exclude<FadeDirection, "NONE">, string> = {
  LEFT: "to right",
  RIGHT: "to left",
  TOP: "to bottom",
  BOTTOM: "to top",
};

/**
 * The colour fade laid over the picture: solid on the chosen side, clear on the far side.
 * `strength` 0–100 scales its opacity. The fill is a CSS colour (a hex or `var(--banner-bg)`).
 */
export function fadeStyle(fill: string, direction: FadeDirection, strength: number): Record<string, string> | null {
  if (direction === "NONE" || strength <= 0) return null;
  const s = Math.min(100, Math.max(0, strength));
  const toward = TOWARD[direction];
  const solid = Math.round(s * 0.92);
  const mid = Math.round(s * 0.68);
  return {
    backgroundImage: `linear-gradient(${toward}, color-mix(in srgb, ${fill} ${solid}%, transparent) 0%, color-mix(in srgb, ${fill} ${mid}%, transparent) 48%, transparent 88%)`,
    maskImage: `linear-gradient(${toward}, #000 38%, transparent 82%)`,
    WebkitMaskImage: `linear-gradient(${toward}, #000 38%, transparent 82%)`,
  };
}

/** Light-theme fill of each preset (same values as `.banner-card[data-banner-theme]` in globals.css). */
export const THEME_FILL = {
  PINK: "#f6bfd4",
  LILAC: "#e4d9fb",
  SKY: "#bfe9f7",
  BUTTER: "#fff0b8",
  MINT: "#d3f2e3",
} as const;

export const FADE_LABEL_TH: Record<FadeDirection, string> = {
  LEFT: "ซ้าย",
  RIGHT: "ขวา",
  TOP: "บน",
  BOTTOM: "ล่าง",
  NONE: "ไม่ไล่",
};

/** Blur radius (px) at the text edge; strength 0–100 maps to 0–16px. */
export function textBlurPx(strength: number): number {
  return Math.round((Math.min(100, Math.max(0, strength)) / 100) * 16);
}

/**
 * Progressive blur behind the text: three copies of the picture blurred less and less, each shown
 * over a band that ends further right. Painted bottom → top, the strongest sits on top at the far
 * left, so the blur steps down smoothly (full → half → a fifth → sharp) instead of one blurred
 * layer simply fading out.
 */
export function textBlurLayers(strength: number): { px: number; mask: string }[] {
  const max = textBlurPx(strength);
  return [
    { px: Math.round(max * 0.2), mask: "linear-gradient(to right, #000 0%, #000 50%, transparent 70%)" },
    { px: Math.round(max * 0.5), mask: "linear-gradient(to right, #000 0%, #000 36%, transparent 54%)" },
    { px: max, mask: "linear-gradient(to right, #000 0%, #000 22%, transparent 40%)" },
  ].filter((l) => l.px > 0);
}

/**
 * The card's blur stack. With `fullBlur` the whole picture is blurred, heaviest behind the text
 * and easing off to the right without ever reaching sharp: a full-card base layer at the floor,
 * and the text-side layers lifted to at least that floor so the blur never dips mid-card.
 */
export function cardBlurLayers(textBlur: number, fullBlur: boolean): { px: number; mask: string }[] {
  const text = textBlurLayers(textBlur);
  if (!fullBlur) return text;
  const floor = Math.max(2, Math.round(textBlurPx(textBlur) * 0.25));
  return [{ px: floor, mask: "none" }, ...text.map((l) => ({ ...l, px: Math.max(l.px, floor) }))];
}
