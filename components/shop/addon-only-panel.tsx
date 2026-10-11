import { useTranslations } from "next-intl";
import { ChevronRight, ImageOff, Puzzle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PreviewImage } from "@/components/shared/preview-image";
import type { AddonMainLink } from "@/lib/addons/queries";
import type { ProductPrice as Price } from "@/lib/pricing/calculate";
import type { ProductStatus } from "@/lib/products/status";
import { ProductPrice } from "./product-price";
import { DiscountBadge } from "./discount-badge";

/**
 * Buy area of an add-on-only product: its price, and links to the products that sell it.
 * There is no add-to-cart here; the server refuses one too (addToCart → ADDON_ONLY).
 */
export function AddonOnlyPanel({ price, status, mains }: { price: Price; status: ProductStatus; mains: AddonMainLink[] }) {
  const t = useTranslations("shop.product");
  return (
    <div className="space-y-4 rounded-3xl bg-background/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <ProductPrice price={price} size="lg" />
        {price.isDiscounted && <DiscountBadge percent={price.discountPercent} />}
      </div>
      {status === "ENDED" && (
        <p role="status" className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">
          {t("saleEnded")}
        </p>
      )}
      <div className="space-y-1 rounded-2xl bg-secondary/50 p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Puzzle className="size-4" aria-hidden /> {t("addonOnlyTitle")}
        </p>
        <p className="text-sm text-foreground/75">{t("addonOnlyHint")}</p>
      </div>

      {mains.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("addonOnlyNoMain")}</p>
      ) : (
        <section aria-labelledby="addon-mains" className="space-y-2">
          <h2 id="addon-mains" className="text-sm font-medium text-muted-foreground">
            {t("addonOnlyMains")}
          </h2>
          <ul className="space-y-2">
            {mains.map((m) => (
              <li key={m.slug}>
                <Link
                  href={`/product/${m.slug}`}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-2 pr-3 transition-colors hover:bg-secondary/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {m.imageUrl ? (
                      <PreviewImage src={m.imageUrl} alt="" fill sizes="48px" className="object-cover" />
                    ) : (
                      <ImageOff className="absolute inset-0 m-auto size-4 text-muted-foreground" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground">{t("addonOnlyGoTo")}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
