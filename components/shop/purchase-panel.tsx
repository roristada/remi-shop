import { useTranslations } from "next-intl";
import { Download, Mail, RefreshCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import type { PurchaseOption } from "@/lib/cart/queries";
import type { ProductPrice as Price } from "@/lib/pricing/calculate";
import type { ProductStatus } from "@/lib/products/status";
import { ProductPrice } from "./product-price";
import { DiscountBadge } from "./discount-badge";
import { DeadlineNotice } from "./deadline-notice";
import { VariantPurchase } from "./variant-purchase";
import { WaitlistButton } from "./waitlist-button";
import { pickDeadline } from "@/lib/products/deadline";

type Props = {
  price: Price;
  status: ProductStatus;
  saleStartAt: Date | null;
  saleEndAt: Date | null;
  now: Date;
  product: { id: string; slug: string };
  /** From getPurchaseOptions: one option without variants, one per active variant, none if all are off. */
  options: PurchaseOption[];
  /** Option id → picture URL, for options that have one. */
  variantImages?: Record<string, string>;
  /** The latest version has no file yet, so the store emails it instead of an instant download. */
  emailDelivery?: boolean;
  /** Signed-in customer is on this product's waitlist (only meaningful while SCHEDULED). */
  waitlisted?: boolean;
  /** Customers waiting for this product, including this one. */
  waitlistCount?: number;
};

/** Price, sale state and the buy action. Every value here is computed server-side. */
export function PurchasePanel({ price, status, saleStartAt, saleEndAt, now, product, options, variantImages = {}, emailDelivery = false, waitlisted = false, waitlistCount = 0 }: Props) {
  const t = useTranslations("shop.product");
  const hasVariants = options.length !== 1 || options[0].variantId !== null;
  const single = hasVariants ? null : options[0];
  // All variants switched off: nothing can be bought, like a disabled product.
  const purchasable = status === "ACTIVE" && options.length > 0;
  // A buyer who owns it (or has it in an open order) still sees that state, not "sold out".
  const soldOut = single?.state === "soldOut";
  // With variants the picker shows each price; otherwise (and when not on sale) the cheapest one.
  const shownPrice = hasVariants && options.length > 0
    ? options.reduce((min, o) => (o.price.finalPrice < min.price.finalPrice ? o : min)).price
    : (single?.price ?? price);
  const showVariantPicker = purchasable && hasVariants;
  const serverNow = now.toISOString();
  // Only one deadline is shown at a time: before opening, the opening; on sale, whichever ends first.
  const deadline = pickDeadline({
    status,
    saleStartAt,
    saleEndAt,
    // With variants the chosen variant's discount is shown by the picker instead.
    discountEndsAt: purchasable && !hasVariants && price.isDiscounted ? price.discountEndsAt : null,
  });

  return (
    <div className="space-y-4 rounded-3xl bg-background/80 p-5 sm:p-6">
      {!showVariantPicker && (
        <div className="flex flex-wrap items-center gap-3">
          {hasVariants && <span className="text-sm text-muted-foreground">{t("fromPrice")}</span>}
          <ProductPrice price={shownPrice} size="lg" />
          {shownPrice.isDiscounted && <DiscountBadge percent={shownPrice.discountPercent} />}
        </div>
      )}

      {deadline && !showVariantPicker && <DeadlineNotice kind={deadline.kind} at={deadline.at.toISOString()} serverNow={serverNow} />}
      {status === "ENDED" && (
        <p role="status" className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">
          {t("saleEnded")}
        </p>
      )}
      {(status === "DISABLED" || (status === "ACTIVE" && options.length === 0)) && (
        <p role="status" className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">
          {t("unavailable")}
        </p>
      )}
      {purchasable && soldOut && (
        <p role="status" className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">
          {t("soldOut")}
        </p>
      )}
      {purchasable && !soldOut && single?.stock && (
        <p className="text-sm font-medium">{t("stockLeft", { left: single.stock.left, limit: single.stock.limit })}</p>
      )}

      {showVariantPicker ? (
        <VariantPurchase
          productId={product.id}
          productSlug={product.slug}
          options={options}
          serverNow={serverNow}
          saleEndAt={saleEndAt ? saleEndAt.toISOString() : null}
          images={variantImages}
          emailDelivery={emailDelivery}
        />
      ) : status === "SCHEDULED" ? (
        <WaitlistButton productId={product.id} productSlug={product.slug} initialJoined={waitlisted} initialCount={waitlistCount} />
      ) : purchasable && single && !soldOut ? (
        <AddToCartButton productId={product.id} productSlug={product.slug} initialState={single.state} emailDelivery={emailDelivery} />
      ) : (
        <Button size="lg" className="h-12 w-full rounded-full text-base" disabled>
          <ShoppingBag aria-hidden /> {t("addToCart")}
        </Button>
      )}

      <ul className="space-y-1.5 border-t border-foreground/10 pt-4 text-sm text-foreground/70">
        <li className="flex items-center gap-2">
          {emailDelivery ? (
            <>
              <Mail className="size-4 shrink-0" aria-hidden /> {t("emailDelivery")}
            </>
          ) : (
            <>
              <Download className="size-4 shrink-0" aria-hidden /> {t("instantDownload")}
            </>
          )}
        </li>
        <li className="flex items-center gap-2">
          <RefreshCw className="size-4 shrink-0" aria-hidden /> {t("lifetimeUpdates")}
        </li>
      </ul>
    </div>
  );
}
