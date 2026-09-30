import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, Download, RefreshCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import type { PurchaseOption } from "@/lib/cart/queries";
import { intlLocale } from "@/i18n/localize";
import { formatBangkokDateTime } from "@/lib/datetime";
import type { ProductPrice as Price } from "@/lib/pricing/calculate";
import type { ProductStatus } from "@/lib/products/status";
import { ProductPrice } from "./product-price";
import { DiscountBadge } from "./discount-badge";
import { CountdownTimer } from "./countdown-timer";
import { VariantPurchase } from "./variant-purchase";

type Props = {
  price: Price;
  status: ProductStatus;
  saleStartAt: Date | null;
  saleEndAt: Date | null;
  now: Date;
  product: { id: string; slug: string };
  /** From getPurchaseOptions: one option without variants, one per active variant, none if all are off. */
  options: PurchaseOption[];
};

/** Price, sale state and the buy action. Every value here is computed server-side. */
export function PurchasePanel({ price, status, saleStartAt, saleEndAt, now, product, options }: Props) {
  const t = useTranslations("shop.product");
  const tCountdown = useTranslations("shop.countdown");
  const dateLocale = intlLocale(useLocale()).date;
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

  return (
    <div className="space-y-4 rounded-3xl bg-secondary/45 p-5 sm:p-6">
      {!showVariantPicker && (
        <div className="flex flex-wrap items-center gap-3">
          {hasVariants && <span className="text-sm text-muted-foreground">{t("fromPrice")}</span>}
          <ProductPrice price={shownPrice} size="lg" />
          {shownPrice.isDiscounted && <DiscountBadge percent={shownPrice.discountPercent} />}
        </div>
      )}

      {purchasable && !hasVariants && price.isDiscounted && price.discountEndsAt && (
        <CountdownTimer
          endsAt={price.discountEndsAt.toISOString()}
          serverNow={now.toISOString()}
          label={tCountdown("endsIn")}
          endedLabel={tCountdown("ended")}
        />
      )}

      {status === "SCHEDULED" && saleStartAt && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm">
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            {t("opensAt", { date: formatBangkokDateTime(saleStartAt, dateLocale) })}
          </p>
          {/* Visual only: at zero the page refreshes and the server decides if it is on sale. */}
          <CountdownTimer
            endsAt={saleStartAt.toISOString()}
            serverNow={now.toISOString()}
            label={tCountdown("opensIn")}
            endedLabel={tCountdown("opened")}
          />
        </div>
      )}
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
      {purchasable && saleEndAt && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          {t("endsAt", { date: formatBangkokDateTime(saleEndAt, dateLocale) })}
        </p>
      )}

      {showVariantPicker ? (
        <VariantPurchase productId={product.id} productSlug={product.slug} options={options} serverNow={now.toISOString()} />
      ) : purchasable && single && !soldOut ? (
        <AddToCartButton productId={product.id} productSlug={product.slug} initialState={single.state} />
      ) : (
        <Button size="lg" className="h-12 w-full rounded-full text-base" disabled>
          <ShoppingBag aria-hidden /> {t("addToCart")}
        </Button>
      )}

      <ul className="space-y-1.5 border-t border-foreground/10 pt-4 text-sm text-foreground/70">
        <li className="flex items-center gap-2">
          <Download className="size-4 shrink-0" aria-hidden /> {t("instantDownload")}
        </li>
        <li className="flex items-center gap-2">
          <RefreshCw className="size-4 shrink-0" aria-hidden /> {t("lifetimeUpdates")}
        </li>
      </ul>
    </div>
  );
}
