import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, Download, RefreshCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import type { PurchaseState } from "@/lib/cart/queries";
import { intlLocale } from "@/i18n/localize";
import { formatBangkokDateTime } from "@/lib/datetime";
import type { ProductPrice as Price } from "@/lib/pricing/calculate";
import type { ProductStatus } from "@/lib/products/status";
import type { StockInfo } from "@/lib/products/stock";
import { ProductPrice } from "./product-price";
import { DiscountBadge } from "./discount-badge";
import { CountdownTimer } from "./countdown-timer";

type Props = {
  price: Price;
  status: ProductStatus;
  saleStartAt: Date | null;
  saleEndAt: Date | null;
  now: Date;
  product: { id: string; slug: string };
  purchaseState: PurchaseState;
  stock: StockInfo;
};

/** Price, sale state and the buy action. Every value here is computed server-side. */
export function PurchasePanel({ price, status, saleStartAt, saleEndAt, now, product, purchaseState, stock }: Props) {
  const t = useTranslations("shop.product");
  const tCountdown = useTranslations("shop.countdown");
  const dateLocale = intlLocale(useLocale()).date;
  const purchasable = status === "ACTIVE";
  // A buyer who owns it (or has it in an open order) still sees that state, not "sold out".
  const soldOut = purchaseState === "soldOut";

  return (
    <div className="space-y-4 rounded-3xl bg-secondary/45 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <ProductPrice price={price} size="lg" />
        {price.isDiscounted && <DiscountBadge percent={price.discountPercent} />}
      </div>

      {purchasable && price.isDiscounted && price.discountEndsAt && (
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
      {status === "DISABLED" && (
        <p role="status" className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">
          {t("unavailable")}
        </p>
      )}
      {purchasable && soldOut && (
        <p role="status" className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">
          {t("soldOut")}
        </p>
      )}
      {purchasable && !soldOut && stock && (
        <p className="text-sm font-medium">{t("stockLeft", { left: stock.left, limit: stock.limit })}</p>
      )}
      {purchasable && saleEndAt && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          {t("endsAt", { date: formatBangkokDateTime(saleEndAt, dateLocale) })}
        </p>
      )}

      {purchasable && !soldOut ? (
        <AddToCartButton productId={product.id} productSlug={product.slug} initialState={purchaseState} />
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
