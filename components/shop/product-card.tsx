import Image from "next/image";
import { ImageOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { ProductCardData } from "@/lib/products/storefront-queries";
import { ProductPrice } from "./product-price";
import { DiscountBadge } from "./discount-badge";
import { ProductStatusTag } from "./product-status-tag";

/** Gallery-style tile: the preview image is the card; text sits below it without a frame. */
export function ProductCard({ product, priority = false }: { product: ProductCardData; priority?: boolean }) {
  const { price } = product;
  return (
    <article className="group relative flex w-full flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-secondary/60 ring-1 ring-black/5 ring-inset">
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt}
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 768px) 33vw, 50vw"
            loading={priority ? "eager" : "lazy"}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        ) : (
          <ImageOff className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
        )}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
          {price.isDiscounted && <DiscountBadge percent={price.discountPercent} />}
          <ProductStatusTag status={product.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-0.5">
        {/* Which app a file is for is the buyer's first question, so it rides with the category. */}
        <p className="truncate text-xs text-muted-foreground">
          {product.categoryName}
          {product.software && <span className="text-foreground/80"> · {product.software}</span>}
        </p>
        <h3 className="line-clamp-2 font-sans text-[0.95rem] leading-snug font-semibold sm:text-base">
          {/* Stretched link: the whole tile is clickable, with one link in the tab order. */}
          <Link
            href={`/product/${product.slug}`}
            className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-4"
          >
            {product.name}
          </Link>
        </h3>
        <ProductPrice price={price} className="mt-auto" />
      </div>
    </article>
  );
}
