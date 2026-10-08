import { useLocale, useTranslations } from "next-intl";
import { formatTHB, type ProductPrice as Price } from "@/lib/pricing/calculate";
import { intlLocale } from "@/i18n/localize";
import { cn } from "@/lib/utils";

/** sm = lists and cart, md = product cards, lg = product page. */
type Props = { price: Price; size?: "sm" | "md" | "lg"; className?: string };

/** Renders a server-calculated price. Never compute prices on the client. */
export function ProductPrice({ price, size = "sm", className }: Props) {
  const t = useTranslations("shop.price");
  const locale = intlLocale(useLocale()).number;
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className="sr-only">{t("current")}</span>
      <span className={cn("font-semibold tabular-nums", size === "lg" ? "text-3xl" : size === "md" ? "text-lg font-bold" : "text-base", price.isDiscounted && "text-brand-strong")}>
        {formatTHB(price.finalPrice, locale)}
      </span>
      {price.isDiscounted && (
        <>
          <span className="sr-only">{t("original")}</span>
          <s className={cn("text-muted-foreground", size === "lg" ? "text-base" : "text-xs")}>
            {formatTHB(price.unitPrice, locale)}
          </s>
        </>
      )}
    </p>
  );
}
