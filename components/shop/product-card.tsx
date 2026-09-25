import Image from "next/image";
import { ImageOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { ProductCardData } from "@/lib/products/storefront-queries";
import { ProductPrice } from "./product-price";
import { DiscountBadge } from "./discount-badge";
import { ProductStatusTag } from "./product-status-tag";

export function ProductCard({ product, priority = false }: { product: ProductCardData; priority?: boolean }) {
  const { price } = product;
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-card shadow-soft transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-muted">
        {product.image ? (
          <Image
            src={product.image.url}
            alt={product.image.alt}
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 768px) 33vw, 50vw"
            loading={priority ? "eager" : "lazy"}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <ImageOff className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {price.isDiscounted && <DiscountBadge percent={price.discountPercent} />}
          <ProductStatusTag status={product.status} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <p className="truncate text-xs text-muted-foreground">
          {product.categoryName}
          {product.software ? ` · ${product.software}` : ""}
        </p>
        <h3 className="line-clamp-2 text-sm leading-snug font-semibold sm:text-base">
          {/* Stretched link: the whole card is clickable, with one link in the tab order. */}
          <Link
            href={`/product/${product.slug}`}
            className="rounded-sm after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {product.name}
          </Link>
        </h3>
        <ProductPrice price={price} className="mt-auto pt-1" />
      </div>
    </article>
  );
}
