import { useLocale, useTranslations } from "next-intl";
import { Pagination } from "@/components/shared/pagination";

type Props = {
  page: number;
  pageCount: number;
  params: Record<string, string | string[] | undefined>;
  /** Locale-less path, e.g. "/shop". */
  path: string;
};

export function ShopPagination({ page, pageCount, params, path }: Props) {
  const t = useTranslations("shop.pagination");
  const locale = useLocale();
  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      params={params}
      basePath={`/${locale}${path}`}
      className="flex flex-wrap items-center justify-center gap-2 text-sm"
      labels={{
        nav: t("label"),
        previous: t("previous"),
        next: t("next"),
        page: (p, count) => t("page", { page: p, pageCount: count }),
        goTo: (p) => t("goTo", { page: p }),
      }}
    />
  );
}
