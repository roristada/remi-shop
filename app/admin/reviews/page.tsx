import Link from "next/link";
import { Star } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listReviewsForAdmin } from "@/lib/reviews/queries";
import { formatBangkokDateTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import { ReviewVisibilityButton } from "@/components/admin/review-visibility-button";

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requireAdmin();
  const sp = await searchParams;
  const hiddenOnly = sp.filter === "hidden";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));
  const { rows, total, pageCount } = await listReviewsForAdmin(page, hiddenOnly);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">รีวิวสินค้า</h1>
          <p className="text-sm text-muted-foreground">
            {hiddenOnly ? "รีวิวที่ซ่อนอยู่" : "ทั้งหมด"} {total.toLocaleString("th-TH")} รายการ · ซ่อนรีวิวที่ไม่เหมาะสมได้ (คะแนนเฉลี่ยจะคำนวณใหม่)
          </p>
        </div>
        <nav aria-label="ตัวกรอง" className="flex gap-2">
          <Button asChild size="sm" variant={hiddenOnly ? "outline" : "secondary"} className="rounded-full">
            <Link href="/admin/reviews">ทั้งหมด</Link>
          </Button>
          <Button asChild size="sm" variant={hiddenOnly ? "secondary" : "outline"} className="rounded-full">
            <Link href="/admin/reviews?filter=hidden">ที่ซ่อนอยู่</Link>
          </Button>
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <p className="font-medium">{hiddenOnly ? "ไม่มีรีวิวที่ซ่อนอยู่" : "ยังไม่มีรีวิว"}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <Link href={`/admin/products/${r.product.id}`} className="font-medium hover:underline">
                    {r.product.nameTH}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {r.user.displayName ? `${r.user.displayName} (${r.user.email})` : r.user.email} ·{" "}
                    {formatBangkokDateTime(r.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-sm font-medium tabular-nums">
                    <Star className="size-4 text-brand-strong" fill="currentColor" strokeWidth={0} aria-hidden /> {r.rating}/5
                  </span>
                  {r.isHidden && <Badge className="bg-muted text-muted-foreground">ซ่อนอยู่</Badge>}
                </div>
              </div>
              <p className="text-sm whitespace-pre-line break-words">{r.body}</p>
              <ReviewVisibilityButton reviewId={r.id} hidden={r.isHidden} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageCount={pageCount} params={{ filter: hiddenOnly ? "hidden" : undefined }} basePath="/admin/reviews" />
    </div>
  );
}
