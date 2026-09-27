import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { intlLocale } from "@/i18n/localize";
import { formatTHB } from "@/lib/pricing/calculate";
import { PRICE_BUCKETS, type PriceBucketKey, type ShopFilters } from "@/lib/products/storefront";
import { Button } from "@/components/ui/button";

type Facet<V extends string> = { value: V; label: string; count: number };

type Props = {
  filters: ShopFilters;
  /** Locale-less path the form submits to, e.g. "/shop". */
  action: string;
  /** Extra params the form must keep on submit (current search/sort/sale/view/folder). */
  hiddenFields?: Record<string, string | undefined>;
  /** Where "clear filters" goes. */
  clearHref: string;
  categories: { slug: string; name: string; count: number }[];
  softwareTags: { id: string; name: string; count: number }[];
  priceCounts: { key: PriceBucketKey; count: number }[];
};

/** Server-rendered GET form: file type, software and price, each with a live product count. */
export function ShopSidebarFilters({
  filters,
  action,
  hiddenFields,
  clearHref,
  categories,
  softwareTags,
  priceCounts,
}: Props) {
  const t = useTranslations("shop.filters");
  const locale = useLocale();
  const money = (baht: number) => formatTHB(baht * 100, intlLocale(locale).number);

  const priceFacets: Facet<PriceBucketKey | "">[] = [
    { value: "", label: t("priceAll"), count: priceCounts.reduce((sum, p) => sum + p.count, 0) },
    ...PRICE_BUCKETS.map((b, i) => ({
      value: b.key,
      label:
        b.min === undefined
          ? t("priceUnder", { amount: money(b.max) })
          : b.max === undefined
            ? t("priceOver", { amount: money(b.min) })
            : t("priceBetween", { min: money(b.min), max: money(b.max) }),
      count: priceCounts[i]?.count ?? 0,
    })),
  ];

  const hasFacets = Boolean(filters.category.length > 0 || filters.software.length > 0 || filters.price);

  const groups = (
    <div className="space-y-6">
      <CheckboxGroup
        title={t("fileType")}
        name="category"
        options={categories.map((c) => ({ value: c.slug, label: c.name, count: c.count }))}
        selected={filters.category}
      />
      {softwareTags.length > 0 && (
        <CheckboxGroup
          title={t("softwareTitle")}
          name="software"
          options={softwareTags.map((s) => ({ value: s.id, label: s.name, count: s.count }))}
          selected={filters.software}
        />
      )}
      <RadioGroup title={t("priceTitle")} name="price" options={priceFacets} selected={filters.price ?? ""} />
      <Button type="submit" className="h-10 w-full rounded-xl">
        {t("apply")}
      </Button>
      {hasFacets && (
        <Link href={clearHref} className="block text-center text-sm text-muted-foreground hover:text-foreground hover:underline">
          {t("clear")}
        </Link>
      )}
    </div>
  );

  return (
    <aside aria-label={t("sidebarLabel")} className="space-y-4 lg:w-56 lg:shrink-0">
      <form action={`/${locale}${action}`}>
        {Object.entries(hiddenFields ?? {}).map(([name, value]) =>
          value ? <input key={name} type="hidden" name={name} value={value} /> : null,
        )}
        <details className="group rounded-2xl border p-4 lg:hidden">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-medium marker:content-none">
            {t("sidebarLabel")}
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="pt-4">{groups}</div>
        </details>
        <div className="hidden lg:block">{groups}</div>
      </form>
    </aside>
  );
}

function CheckboxGroup({
  title,
  name,
  options,
  selected,
}: {
  title: string;
  name: string;
  options: Facet<string>[];
  selected: string[];
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{title}</legend>
      <div className="space-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-9 cursor-pointer items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                name={name}
                value={o.value}
                defaultChecked={selected.includes(o.value)}
                disabled={o.count === 0 && !selected.includes(o.value)}
                className="size-4 accent-brand-strong"
              />
              {o.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{o.count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RadioGroup({
  title,
  name,
  options,
  selected,
}: {
  title: string;
  name: string;
  options: Facet<string>[];
  selected: string;
}): ReactNode {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{title}</legend>
      <div className="space-y-1">
        {options.map((o) => (
          <label key={o.value || "all"} className="flex min-h-9 cursor-pointer items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name={name}
                value={o.value}
                defaultChecked={selected === o.value}
                disabled={o.count === 0 && selected !== o.value}
                className="size-4 accent-brand-strong"
              />
              {o.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{o.count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
