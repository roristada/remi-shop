import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { FolderSection as FolderSectionData } from "@/lib/products/storefront-queries";
import { ProductGrid } from "./product-grid";
import { folderAnchor } from "./shop-view-nav";

/** One folder on /shop "By folder": heading, count, first cards, and a link to the full list. */
export function FolderSection({ section, priority = false }: { section: FolderSectionData; priority?: boolean }) {
  const t = useTranslations("shop.folder");
  const id = folderAnchor(section.slug);
  const more = section.total > section.items.length;

  return (
    <section aria-labelledby={`${id}-title`} id={id} className="scroll-mt-24 space-y-5 border-t pt-8 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 id={`${id}-title`} className="truncate text-xl sm:text-2xl">
            {section.name ?? t("unfiled")}
          </h2>
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{t("count", { count: section.total })}</span>
        </div>
        {more && section.slug && (
          <Link
            href={`/shop?folder=${encodeURIComponent(section.slug)}`}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-strong underline-offset-4 hover:underline"
          >
            {t("viewAll", { count: section.total })}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      <ProductGrid products={section.items} priority={priority} />
    </section>
  );
}
