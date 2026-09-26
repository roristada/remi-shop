import type { SVGProps } from "react";

/**
 * The Remi Shop bunny mark, hand-authored from the brand's reference art
 * (template/S__5398532_0.jpg): a rounded face, two splayed ears, closed
 * "sleepy" eyes. Body fills `currentColor`; eyes cut through as the page
 * background so the mark works on paper, powder-sky or the pink brand fill
 * alike — pass `eyeColor` to pin a fixed color (e.g. the static favicon).
 */
export function BunnyMark({ eyeColor = "var(--background)", ...props }: SVGProps<SVGSVGElement> & { eyeColor?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M13.5 20.5c-2.9-5.9-1.7-11.7 2.1-13.5 3.8-1.8 8.9 1.5 11.8 7.4 1.2 2.4 1.8 4.8 1.9 6.9h5.4c.1-2.1.7-4.5 1.9-6.9 2.9-5.9 8-9.2 11.8-7.4 3.8 1.8 5 7.6 2.1 13.5-1.6 3.2-4 5.8-6.5 7.3 4.9 2.9 8 7.9 8 13.6 0 9.7-9 14.6-20 14.6s-20-4.9-20-14.6c0-5.7 3.1-10.7 8-13.6-2.5-1.5-4.9-4.1-6.5-7.3Z"
      />
      <path
        stroke={eyeColor}
        strokeWidth={3}
        strokeLinecap="round"
        d="M22 39.5c1.8 3 4.8 3 6.6 0M35.5 39.5c1.8 3 4.8 3 6.6 0"
      />
    </svg>
  );
}
