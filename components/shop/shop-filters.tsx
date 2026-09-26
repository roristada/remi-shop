import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectInput } from "@/components/admin/form-controls";
import { Link } from "@/i18n/navigation";
import type { ShopFilters } from "@/lib/products/storefront";

// Fails the slug check in parseShopFilters(), i.e. "no category filter".
const ALL_CATEGORIES = "_all";

type Props = {
  filters: ShopFilters;
  /** Locale-less path the form submits to, e.g. "/shop" or "/category/brushes". */
  action: string;
  /** Omit on category pages, where the category is fixed by the URL. */
  categories?: { slug: string; name: string }[];
  /** Extra params the form must keep on submit (e.g. `view=all`, the folder filter). */
  hiddenFields?: Record<string, string | undefined>;
  /** Where "clear filters" goes. Defaults to `action`. */
  clearHref?: string;
};

/** Plain GET form: works without JavaScript and keeps filters in the URL. */
export function ShopFilterForm({ filters, action, categories, hiddenFields, clearHref = action }: Props) {
  const t = useTranslations("shop.filters");
  const locale = useLocale();
  const hasFilters = Boolean(filters.q || filters.category || filters.folder || filters.sale || filters.sort !== "newest");

  return (
    <form
      action={`/${locale}${action}`}
      role="search"
      aria-label={t("label")}
      className="flex flex-wrap items-end gap-2 rounded-3xl bg-secondary/45 p-2.5"
    >
      {Object.entries(hiddenFields ?? {}).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <label className="relative min-w-52 flex-[2_1_16rem]">
        <span className="sr-only">{t("search")}</span>
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder={t("searchPlaceholder")}
          maxLength={100}
          className="h-10 rounded-xl border-transparent bg-background pl-9"
        />
      </label>
      {categories && (
        <SelectInput
          label={t("category")}
          hideLabel
          name="category"
          defaultValue={filters.category ?? ALL_CATEGORIES}
          options={[
            { value: ALL_CATEGORIES, label: t("allCategories") },
            ...categories.map((c) => ({ value: c.slug, label: c.name })),
          ]}
          wrapperClassName="min-w-40 flex-1 space-y-0"
          className="border-transparent bg-background"
        />
      )}
      <SelectInput
        label={t("sort")}
        hideLabel
        name="sort"
        defaultValue={filters.sort}
        options={[
          { value: "newest", label: t("sortNewest") },
          { value: "price-asc", label: t("sortPriceAsc") },
          { value: "price-desc", label: t("sortPriceDesc") },
          { value: "name", label: t("sortName") },
        ]}
        wrapperClassName="min-w-40 flex-1 space-y-0"
        className="border-transparent bg-background"
      />
      <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-background px-3 text-sm">
        <input
          type="checkbox"
          name="sale"
          value="1"
          defaultChecked={filters.sale}
          className="size-4 accent-brand-strong"
        />
        {t("onSale")}
      </label>
      <Button type="submit" className="h-10 rounded-xl px-5">
        {t("apply")}
      </Button>
      {hasFilters && (
        <Button asChild variant="ghost" className="h-10 rounded-xl px-3">
          <Link href={clearHref}>{t("clear")}</Link>
        </Button>
      )}
    </form>
  );
}
