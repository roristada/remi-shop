import Image, { type ImageProps } from "next/image";

const ANIMATED = /\.gif(?:$|[?#])/i;

/**
 * next/image for product preview art. Animated GIFs skip the optimizer: the Netlify image CDN
 * rounds each frame's height when resizing, so the frames drift and the art bobs up and down.
 */
export function PreviewImage({ alt, ...props }: ImageProps) {
  const animated = typeof props.src === "string" && ANIMATED.test(props.src);
  return <Image alt={alt} unoptimized={animated} {...props} />;
}
