import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, Download, RefreshCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { intlLocale } from "@/i18n/localize";
import { formatBangkokDateTime } from "@/lib/datetime";
import type { ProductPrice as Price } from "@/lib/pricing/calculate";
import type { ProductStatus } from "@/lib/products/status";
import { ProductPrice } from "./product-price";
import { DiscountBadge } from "./discount-badge";
import { CountdownTimer } from "./countdown-timer";

type Props = {
  price: Price;
  status: ProductStatus;
  saleStartAt: Date | null;
  saleEndAt: Date | null;
  now: Date;
};

/** Price, sale state and the buy action. Every value here is computed server-side. */
export function PurchasePanel({ price, status, saleStartAt, saleEndAt, now }: Props) {
  const t = useTranslations("shop.product");
  const dateLocale = intlLocale(useLocale()).date;
  const purchasable = status === "ACTIVE";

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ProductPrice price={price} size="lg" />
        {price.isDiscounted && <DiscountBadge percent={price.discountPercent} />}
      </div>

      {purchasable && price.isDiscounted && price.discountEndsAt && (
        <CountdownTimer endsAt={price.discountEndsAt.toISOString()} serverNow={now.toISOString()} />
      )}

      {status === "SCHEDULED" && saleStartAt && (
        <p className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm">
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          {t("opensAt", { date: formatBangkokDateTime(saleStartAt, dateLocale) })}
        </p>
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
      {purchasable && saleEndAt && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          {t("endsAt", { date: formatBangkokDateTime(saleEndAt, dateLocale) })}
        </p>
      )}

      {/* Wired up in Phase 6 (cart). The server will re-check availability and price. */}
      <div className="space-y-1.5">
        <Button size="lg" className="h-12 w-full rounded-full text-base" disabled
          aria-describedby={purchasable ? "cart-soon" : undefined}
        >
          <ShoppingBag aria-hidden /> {t("addToCart")}
        </Button>
        {purchasable && (
          <p id="cart-soon" className="text-center text-xs text-muted-foreground">
            {t("cartSoon")}
          </p>
        )}
      </div>

      <ul className="space-y-1.5 border-t pt-4 text-sm text-muted-foreground">
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
