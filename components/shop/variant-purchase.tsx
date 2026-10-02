"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import type { PurchaseOption } from "@/lib/cart/queries";
import { intlLocale } from "@/i18n/localize";
import { formatTHB } from "@/lib/pricing/calculate";
import { cn } from "@/lib/utils";
import { ProductPrice } from "./product-price";
import { DiscountBadge } from "./discount-badge";
import { CountdownTimer } from "./countdown-timer";
import { useSelectedVariant } from "./selected-variant";
import { defaultVariantId } from "@/lib/cart/selection";

type Props = {
  productId: string;
  productSlug: string;
  /** Every option has a variantId; prices and states come from the server. */
  options: PurchaseOption[];
  serverNow: string;
};

/**
 * Pick one variant, then add it. Each variant is its own cart line, so buying two means adding
 * them one at a time. Choosing only changes what is shown; the server re-checks on add.
 */
export function VariantPurchase({ productId, productSlug, options, serverNow }: Props) {
  const t = useTranslations("shop.product");
  const tBadge = useTranslations("shop.badge");
  const tCountdown = useTranslations("shop.countdown");
  const number = intlLocale(useLocale()).number;
  // The page-wide selection (file list follows it) when there is one, otherwise local.
  const shared = useSelectedVariant();
  const [localId, setLocalId] = useState(() => defaultVariantId(options));
  const selectedId = shared ? shared.selectedId : localId;
  const select = shared ? shared.select : setLocalId;
  const selected = options.find((o) => o.variantId === selectedId) ?? options[0];

  function stateLabel(o: PurchaseOption): string | null {
    if (o.state === "owned") return t("variantOwned");
    if (o.state === "inOrder") return t("variantInOrder");
    if (o.state === "inCart") return t("variantInCart");
    if (o.state === "soldOut") return tBadge("soldOut");
    return o.stock ? tBadge("stock", { left: o.stock.left, limit: o.stock.limit }) : null;
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{t("chooseVariant")}</legend>
        {options.map((o) => {
          const checked = o.variantId === selected.variantId;
          const label = stateLabel(o);
          return (
            <label
              key={o.variantId}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border bg-background px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                checked ? "border-brand-strong ring-1 ring-brand-strong" : "hover:border-foreground/30",
              )}
            >
              <input
                type="radio"
                name={`variant-${productId}`}
                value={o.variantId ?? ""}
                checked={checked}
                onChange={() => select(o.variantId)}
                className="size-4 accent-[var(--color-brand-strong)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{o.name}</span>
                {label && <span className="block text-xs text-muted-foreground">{label}</span>}
              </span>
              <span className="text-right tabular-nums">
                <span className={cn("block font-semibold", o.price.isDiscounted && "text-brand-strong")}>
                  {formatTHB(o.price.finalPrice, number)}
                </span>
                {o.price.isDiscounted && (
                  <s className="block text-xs text-muted-foreground">{formatTHB(o.price.unitPrice, number)}</s>
                )}
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <ProductPrice price={selected.price} size="lg" />
        {selected.price.isDiscounted && <DiscountBadge percent={selected.price.discountPercent} />}
      </div>
      {selected.price.isDiscounted && selected.price.discountEndsAt && (
        <CountdownTimer
          key={`countdown-${selected.variantId}`}
          endsAt={new Date(selected.price.discountEndsAt).toISOString()}
          serverNow={serverNow}
          label={tCountdown("endsIn")}
          endedLabel={tCountdown("ended")}
        />
      )}

      {/* Keyed by variant so each choice starts from its own server-computed state. */}
      <AddToCartButton
        key={`cart-${selected.variantId}`}
        productId={productId}
        variantId={selected.variantId}
        productSlug={productSlug}
        initialState={selected.state}
      />
    </div>
  );
}
