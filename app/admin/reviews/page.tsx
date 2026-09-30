import Link from "next/link";
import { Search, Star } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { listReviewsForAdmin } from "@/lib/reviews/queries";
import { formatBangkokDateTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectInput } from "@/components/admin/form-controls";
import { adminReviewFilterParams, parseAdminReviewFilters } from "@/lib/reviews/rules";
import { Pagination } from "@/components/shared/pagination";
import { ReviewVisibilityButton } from "@/components/admin/review-visibility-button";

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  await requireAdmin();
  const filters = parseAdminReviewFilters(await searchParams);
  const { rows, total, pageCount } = await listReviewsForAdmin(filters);
  const filtered = Boolean(filters.q || filters.rating || filters.visibility !== "all");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">รีวิวสินค้า</h1>
          <p className="text-sm text-muted-foreground">
            {filtered ? "ตรงกับตัวกรอง" : "ทั้งหมด"} {total.toLocaleString("th-TH")} รายการ · ซ่อนรีวิวที่ไม่เหมาะสมได้ (คะแนนเฉลี่ยจะคำนวณใหม่)
          </p>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3 shadow-soft" role="search">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">ค้นหา</span>
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="ชื่อสินค้า ผู้รีวิว หรือข้อความรีวิว"
            className="h-10 rounded-xl pl-9"
          />
        </label>
        {/* "all" is a sentinel: it fails validation, i.e. "no filter". */}
        <SelectInput
          label="คะแนน"
          hideLabel
          name="rating"
          defaultValue={filters.rating ? String(filters.rating) : "all"}
          options={[
            { value: "all", label: "ทุกคะแนน" },
            ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} ดาว` })),
          ]}
          wrapperClassName="w-36 space-y-0"
        />
        <SelectInput
          label="การแสดงผล"
          hideLabel
          name="visibility"
          defaultValue={filters.visibility}
          options={[
            { value: "all", label: "ทั้งหมด" },
            { value: "visible", label: "แสดงอยู่" },
            { value: "hidden", label: "ซ่อนอยู่" },
          ]}
          wrapperClassName="w-36 space-y-0"
        />
        <Button type="submit" variant="secondary" className="h-10 rounded-xl px-4">
          กรอง
        </Button>
        {filtered && (
          <Button asChild variant="ghost" className="h-10 rounded-xl px-3">
            <Link href="/admin/reviews">ล้าง</Link>
          </Button>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <p className="font-medium">{filtered ? "ไม่พบรีวิวที่ตรงกับตัวกรอง" : "ยังไม่มีรีวิว"}</p>
          {filtered && <p className="mt-1 text-sm text-muted-foreground">ลองเปลี่ยนตัวกรอง</p>}
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
      <Pagination page={filters.page} pageCount={pageCount} params={adminReviewFilterParams(filters)} basePath="/admin/reviews" />
    </div>
  );
}
