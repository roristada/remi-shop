import { PreviewImage } from "@/components/shared/preview-image";
import { ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import type { ProductCardData } from "@/lib/products/storefront-queries";
import { ProductPrice } from "./product-price";
import { DiscountBadge } from "./discount-badge";
import { ProductStatusTag } from "./product-status-tag";
import { StarRating } from "./star-rating";
import { WishlistButton } from "./wishlist-button";
import { isSoldOut } from "@/lib/products/stock";
import { DeadlineNotice } from "./deadline-notice";

/** Framed tile: image and details share one paper-white card, so each product reads as a unit on the page gradient. */
export function ProductCard({ product, priority = false }: { product: ProductCardData; priority?: boolean }) {
  const { price, stock } = product;
  const t = useTranslations("shop.badge");
  const soldOut = isSoldOut(stock) || product.variantsSoldOut;
  return (
    <article className="group relative flex w-full flex-col gap-3 rounded-3xl bg-card p-2 pb-3 shadow-soft ring-1 ring-black/5 transition-shadow duration-300 hover:shadow-md motion-reduce:transition-none">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-secondary/60">
        {product.image ? (
          <PreviewImage
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
          <ProductStatusTag status={product.status} soldOut={soldOut} />
          {stock && !soldOut && product.status === "ACTIVE" && (
            <Badge className="bg-background/85 text-foreground backdrop-blur-sm">
              {t("stock", { left: stock.left, limit: stock.limit })}
            </Badge>
          )}
        </div>
        {/* Stacks above the card's stretched Link (later in the DOM) so the heart stays clickable. */}
        <div className="absolute top-2 right-2 z-10">
          <WishlistButton
            productId={product.id}
            productSlug={product.slug}
            initialWishlisted={product.wishlisted}
            size="icon-lg"
            className="bg-background/80 backdrop-blur-sm hover:bg-background"
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-1.5">
        {/* Which app a file is for is the buyer's first question, so it rides with the category. */}
        <p className="truncate text-xs text-muted-foreground">
          {product.categoryName}
          {product.softwareTags.length > 0 && (
            <span className="text-foreground/80"> · {product.softwareTags.join(", ")}</span>
          )}
        </p>
        <h3 className="line-clamp-2 font-sans text-[0.95rem] leading-normal font-semibold sm:text-base">
          {/* Stretched link: the whole tile is clickable, with one link in the tab order. */}
          <Link
            href={`/product/${product.slug}`}
            className="after:absolute after:inset-0 after:rounded-3xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2"
          >
            {product.name}
          </Link>
        </h3>
        <StarRating {...product.rating} />
        {/* Visual only: at zero the page refreshes and the server decides it is on sale. */}
        {product.opensAt && (
          <DeadlineNotice kind="opens" at={product.opensAt} serverNow={product.serverNow} size="sm" />
        )}
        <div className="mt-auto flex items-baseline gap-1.5">
          {product.priceFrom && <span className="text-xs text-muted-foreground">{t("fromPrice")}</span>}
          <ProductPrice price={price} />
        </div>
      </div>
    </article>
  );
}
