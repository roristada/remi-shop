import Image, { type ImageProps } from "next/image";

const ANIMATED = /\.gif(?:$|[?#])/i;
/** Copies the server already resized to WebP (see lib/storage/image-optimize). */
const PRE_OPTIMIZED = /\.(?:card|detail)\.webp(?:$|[?#])/i;

/**
 * next/image for product preview art. Animated GIFs skip the optimizer: the Netlify image CDN
 * rounds each frame's height when resizing, so the frames drift and the art bobs up and down.
 * Pre-optimized WebP copies are served as they are (already small, and may be animated).
 */
export function PreviewImage({ alt, ...props }: ImageProps) {
  const src = typeof props.src === "string" ? props.src : "";
  return <Image alt={alt} unoptimized={ANIMATED.test(src) || PRE_OPTIMIZED.test(src)} {...props} />;
}
