import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  page: number;
  pageCount: number;
  /** Current query params; `page` is replaced. */
  params: Record<string, string | undefined>;
  basePath: string;
};

function href(basePath: string, params: Props["params"], page: number) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "page") search.set(k, v);
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function AdminPagination({ page, pageCount, params, basePath }: Props) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="แบ่งหน้า" className="flex items-center justify-end gap-2 text-sm">
      <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
        {page > 1 ? (
          <Link href={href(basePath, params, page - 1)}>
            <ChevronLeft aria-hidden /> ก่อนหน้า
          </Link>
        ) : (
          <span>
            <ChevronLeft aria-hidden /> ก่อนหน้า
          </span>
        )}
      </Button>
      <span className="text-muted-foreground" aria-current="page">
        หน้า {page} / {pageCount}
      </span>
      <Button asChild={page < pageCount} variant="outline" size="sm" disabled={page >= pageCount}>
        {page < pageCount ? (
          <Link href={href(basePath, params, page + 1)}>
            ถัดไป <ChevronRight aria-hidden />
          </Link>
        ) : (
          <span>
            ถัดไป <ChevronRight aria-hidden />
          </span>
        )}
      </Button>
    </nav>
  );
}
