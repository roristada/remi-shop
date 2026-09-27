import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PaginationLabels = {
  nav: string;
  previous: string;
  next: string;
  page: (page: number, pageCount: number) => string;
};

// Admin is Thai-only; the storefront passes translated labels.
const THAI_LABELS: PaginationLabels = {
  nav: "แบ่งหน้า",
  previous: "ก่อนหน้า",
  next: "ถัดไป",
  page: (page, pageCount) => `หน้า ${page} / ${pageCount}`,
};

type Props = {
  page: number;
  pageCount: number;
  /** Current query params; `page` is replaced. A string[] repeats the key (multi-select filters). */
  params: Record<string, string | string[] | undefined>;
  /** Full path including any locale prefix. */
  basePath: string;
  labels?: PaginationLabels;
  className?: string;
};

function href(basePath: string, params: Props["params"], page: number) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (!v || k === "page") continue;
    if (Array.isArray(v)) for (const item of v) search.append(k, item);
    else search.set(k, v);
  }
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ page, pageCount, params, basePath, labels = THAI_LABELS, className }: Props) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={labels.nav} className={className ?? "flex items-center justify-end gap-2 text-sm"}>
      <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
        {page > 1 ? (
          <Link href={href(basePath, params, page - 1)} rel="prev">
            <ChevronLeft aria-hidden /> {labels.previous}
          </Link>
        ) : (
          <span>
            <ChevronLeft aria-hidden /> {labels.previous}
          </span>
        )}
      </Button>
      <span className="text-muted-foreground" aria-current="page">
        {labels.page(page, pageCount)}
      </span>
      <Button asChild={page < pageCount} variant="outline" size="sm" disabled={page >= pageCount}>
        {page < pageCount ? (
          <Link href={href(basePath, params, page + 1)} rel="next">
            {labels.next} <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span>
            {labels.next} <ChevronRight aria-hidden />
          </span>
        )}
      </Button>
    </nav>
  );
}
