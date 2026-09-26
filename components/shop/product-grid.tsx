import { useTranslations } from "next-intl";
import { PackageSearch } from "lucide-react";
import type { ProductCardData } from "@/lib/products/storefront-queries";
import { ProductCard } from "./product-card";

type Props = {
  products: ProductCardData[];
  filtered?: boolean;
  /** Load the first row eagerly (above the fold). Off for grids further down the page. */
  priority?: boolean;
};

export function ProductGrid({ products, filtered = false, priority = true }: Props) {
  const t = useTranslations("shop.empty");
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card px-4 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-secondary">
          <PackageSearch className="size-5" aria-hidden />
        </span>
        <p className="font-semibold">{t("title")}</p>
        <p className="text-sm text-muted-foreground">{filtered ? t("filtered") : t("none")}</p>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id} className="flex">
          <ProductCard product={p} priority={priority && i < 4} />
        </li>
      ))}
    </ul>
  );
}
